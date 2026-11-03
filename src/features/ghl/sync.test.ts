import { describe, expect, it } from "vitest";

import type { GhlContact, GhlOpportunity } from "./client";
import type { LocalStage } from "./map";
import {
  changedContacts,
  contactFingerprint,
  describeSummary,
  emptySummary,
  fingerprint,
  isSyncDue,
  opportunityFingerprint,
  planOpportunitySync,
} from "./sync";

const local: LocalStage[] = [
  {
    id: "s-new",
    pipelineId: "p1",
    pipelineName: "Deals",
    name: "New Deal",
    isWon: false,
    isLost: false,
  },
  {
    id: "s-off",
    pipelineId: "p1",
    pipelineName: "Deals",
    name: "Offer",
    isWon: false,
    isLost: false,
  },
  {
    id: "s-won",
    pipelineId: "p1",
    pipelineName: "Deals",
    name: "Closed",
    isWon: true,
    isLost: false,
  },
  {
    id: "s-lost",
    pipelineId: "p1",
    pipelineName: "Deals",
    name: "Lost",
    isWon: false,
    isLost: true,
  },
];
const stageMap = { g_new: "s-new", g_offer: "s-off" };
const opp = (over: Partial<GhlOpportunity> = {}): GhlOpportunity => ({
  id: "o1",
  name: "12-unit on 30th St",
  monetaryValue: 2_400_000,
  pipelineId: "gp",
  pipelineStageId: "g_new",
  status: "open",
  contactId: "c1",
  ...over,
});

describe("fingerprints", () => {
  it("ignore key order and undefined fields, change with content", () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1, c: undefined }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contact fingerprint follows what the import reads, including DND", () => {
    const c: GhlContact = { id: "c1", firstName: "Ana", email: "ana@example.test" };
    const same = contactFingerprint(c);
    expect(contactFingerprint({ ...c, dateAdded: "2026-01-01" })).toBe(same); // not imported
    expect(contactFingerprint({ ...c, tags: ["seller"] })).not.toBe(same);
    expect(contactFingerprint({ ...c, dnd: true })).not.toBe(same);
    expect(
      contactFingerprint({
        ...c,
        phone: "+16195550100",
        dndSettings: { SMS: { status: "active" } },
      }),
    ).not.toBe(contactFingerprint({ ...c, phone: "+16195550100" }));
  });

  it("opportunity fingerprint changes on stage, status and value", () => {
    const base = opportunityFingerprint(opp());
    expect(opportunityFingerprint(opp({ pipelineStageId: "g_offer" }))).not.toBe(base);
    expect(opportunityFingerprint(opp({ status: "won" }))).not.toBe(base);
    expect(opportunityFingerprint(opp({ monetaryValue: 2_300_000 }))).not.toBe(base);
    expect(opportunityFingerprint(opp({ status: "OPEN" }))).toBe(base);
  });
});

describe("changedContacts", () => {
  it("returns new and changed contacts only", () => {
    const a: GhlContact = { id: "a", firstName: "A" };
    const b: GhlContact = { id: "b", firstName: "B" };
    const c: GhlContact = { id: "c", firstName: "C" };
    const seen = new Map([
      ["a", contactFingerprint(a)],
      ["b", contactFingerprint({ ...b, firstName: "Old" })],
    ]);
    expect(changedContacts([a, b, c], seen).map((x) => x.contact.id)).toEqual(["b", "c"]);
  });
});

describe("planOpportunitySync", () => {
  const run = (o: GhlOpportunity, previous?: string, linkedDealId?: string) =>
    planOpportunitySync({ opportunity: o, previous, linkedDealId, stageMap, local });

  it("creates a deal for a new opportunity (same rules as the one-time import)", () => {
    const p = run(opp());
    expect(p).toMatchObject({ kind: "create", plan: { stageId: "s-new", value: 2_400_000 } });
  });

  it("leaves a linked deal alone while GHL hasn't changed it", () => {
    expect(run(opp(), opportunityFingerprint(opp()), "d1")).toEqual({ kind: "unchanged" });
  });

  it("only records a baseline for deals from the one-time import (no surprise moves)", () => {
    expect(run(opp({ pipelineStageId: "g_offer" }), undefined, "d1")).toEqual({ kind: "baseline" });
  });

  it("moves the deal when GHL moved the opportunity", () => {
    expect(run(opp({ pipelineStageId: "g_offer" }), opportunityFingerprint(opp()), "d1")).toEqual({
      kind: "update",
      dealId: "d1",
      stageId: "s-off",
      value: 2_400_000,
    });
    expect(run(opp({ status: "won" }), opportunityFingerprint(opp()), "d1")).toMatchObject({
      kind: "update",
      stageId: "s-won",
    });
    expect(run(opp({ status: "abandoned" }), opportunityFingerprint(opp()), "d1")).toMatchObject({
      stageId: "s-lost",
    });
  });

  it("skips unmapped stages, and doesn't retry them until GHL changes", () => {
    const unmapped = opp({ pipelineStageId: "g_hold" });
    expect(run(unmapped)).toEqual({ kind: "skip", reason: "Its GoHighLevel stage isn't mapped" });
    expect(run(unmapped, opportunityFingerprint(unmapped))).toEqual({ kind: "unchanged" });
  });
});

describe("isSyncDue", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const s = { enabled: true, interval_minutes: 60, last_started_at: null, lock_until: null };
  it("follows enabled, the interval and the lock", () => {
    expect(isSyncDue(s, now)).toBe(true);
    expect(isSyncDue({ ...s, enabled: false }, now)).toBe(false);
    expect(isSyncDue({ ...s, last_started_at: "2026-11-03T11:30:00Z" }, now)).toBe(false);
    expect(isSyncDue({ ...s, last_started_at: "2026-11-03T10:59:00Z" }, now)).toBe(true);
    expect(isSyncDue({ ...s, lock_until: "2026-11-03T12:05:00Z" }, now)).toBe(false);
  });
});

describe("describeSummary", () => {
  it("is readable and says when nothing changed or the run stopped early", () => {
    expect(describeSummary(emptySummary())).toBe("No changes in GoHighLevel");
    const s = emptySummary();
    s.contacts.created = 2;
    s.contacts.updated = 1;
    s.opportunities.created = 1;
    s.opportunities.moved = 3;
    s.partial = true;
    expect(describeSummary(s)).toBe(
      "2 new / 1 updated contacts · 1 new deal · 3 deals moved (stopped early, continues next run)",
    );
  });
});
