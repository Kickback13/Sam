import { describe, expect, it } from "vitest";

import { parseFieldSources, stampManualSources } from "@/lib/field-sources";
import { endOfTodayIso, formatCurrency, formatDate, initials, todayInAppTz } from "@/lib/format";
import { comingSoonModule, dealNoun, groupNav, mobilePrimaryNav, navFor } from "@/lib/nav";
import { positionAt, positionBetween } from "@/lib/positions";
import { safeNext } from "@/lib/redirects";

describe("nav per business type", () => {
  it("real estate shows the brokerage modules", () => {
    const keys = navFor("real_estate").map((i) => i.key);
    for (const k of [
      "today",
      "deal-finder",
      "alerts",
      "pipeline",
      "people",
      "properties",
      "analyze",
      "outreach",
      "calendar",
      "network",
      "receptionist",
      "settings",
    ]) {
      expect(keys).toContain(k);
    }
    expect(keys).not.toContain("requests");
  });

  it("construction shows the GC modules", () => {
    const keys = navFor("construction").map((i) => i.key);
    for (const k of [
      "today",
      "projects",
      "people",
      "requests",
      "community",
      "messages",
      "settings",
    ])
      expect(keys).toContain(k);
    expect(keys).not.toContain("deal-finder");
  });

  it("future modules carry their phase and only resolve for the right business", () => {
    expect(comingSoonModule("deal-finder", "real_estate")?.phase).toBe(2);
    expect(comingSoonModule("deal-finder", "construction")).toBeNull();
    expect(comingSoonModule("requests", "construction")?.phase).toBe(8);
    expect(comingSoonModule("people", "real_estate")).toBeNull();
  });

  it("groups and mobile nav", () => {
    expect(groupNav(navFor("real_estate")).map((g) => g.group)).toEqual([
      "Home",
      "Find",
      "Work",
      "Engage",
      "Admin",
    ]);
    expect(mobilePrimaryNav("construction").map((i) => i.key)).toEqual([
      "today",
      "projects",
      "people",
      "tasks",
    ]);
    expect(dealNoun("construction", true)).toBe("projects");
  });
});

describe("kanban positions", () => {
  it("places between neighbors", () => {
    expect(positionBetween(undefined, undefined)).toBe(1000);
    expect(positionBetween(undefined, 1000)).toBe(0);
    expect(positionBetween(1000, undefined)).toBe(2000);
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
  it("computes by index", () => {
    const list = [{ position: 10 }, { position: 20 }];
    expect(positionAt(list, 0)).toBe(-990);
    expect(positionAt(list, 1)).toBe(15);
    expect(positionAt(list, 2)).toBe(1020);
    expect(positionAt(list, 99)).toBe(1020);
  });
});

describe("field sources (trust layer)", () => {
  const user = { id: "u1", name: "Sam Rodriguez" };
  const now = new Date("2026-10-09T18:00:00Z");

  it("stamps changed fields as manual entries", () => {
    const next = stampManualSources(
      {},
      {},
      { units: 24, zoning: "RM-1-1", apn: "" },
      ["units", "zoning", "apn"],
      user,
      now,
    );
    expect(next.units).toEqual({
      source: "manual",
      label: "Entered by Sam Rodriguez",
      url: null,
      fetched_at: now.toISOString(),
      user_id: "u1",
    });
    expect(next.apn).toBeUndefined();
  });

  it("keeps sources for unchanged fields and drops cleared ones", () => {
    const existing = {
      units: {
        source: "county",
        label: "SD County Assessor",
        fetched_at: "2026-01-01T00:00:00Z",
        url: "https://example.org",
      },
    };
    const next = stampManualSources(
      existing,
      { units: 24, zoning: "R3" },
      { units: 24, zoning: null },
      ["units", "zoning"],
      user,
      now,
    );
    expect(next.units.source).toBe("county");
    expect(next.zoning).toBeUndefined();
  });

  it("parses stored JSON defensively", () => {
    expect(parseFieldSources(null)).toEqual({});
    expect(parseFieldSources({ units: { source: "demo", fetched_at: "x" }, bad: 1 })).toEqual({
      units: { source: "demo", label: "demo", url: null, fetched_at: "x", user_id: null },
    });
  });
});

describe("formatting", () => {
  it("formats money and dates in Pacific time", () => {
    expect(formatCurrency(4950000)).toBe("$4,950,000");
    expect(formatCurrency(4950000, { compact: true })).toBe("$5M");
    expect(formatCurrency(null)).toBe("—");
    expect(formatDate("2026-03-02")).toBe("Mar 2, 2026");
    // 2026-10-10 03:00 UTC is still Oct 9 in San Diego
    expect(todayInAppTz(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-09");
    expect(endOfTodayIso(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-10T06:59:59.999Z");
    expect(initials("Sam Rodriguez")).toBe("SR");
  });
});

describe("safeNext", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/w/demo/today")).toBe("/w/demo/today");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
