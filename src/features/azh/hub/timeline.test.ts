import { describe, expect, it } from "vitest";

import {
  estimateEvents,
  matchesFilter,
  mergeHub,
  projectEvents,
  requestEvents,
  visitEvent,
  type HubRequest,
} from "./timeline";

const request: HubRequest = {
  id: "r1",
  status: "converted",
  office: "fallbrook",
  service_type: "Drywall",
  description: "Patch two walls",
  job_address: "1 Example St",
  source: "web_form",
  submitted_at: "2026-11-01T16:00:00.000Z",
  contacted_at: "2026-11-01T18:00:00.000Z",
  converted_at: "2026-11-03T18:00:00.000Z",
  closed_at: null,
};

describe("AZH communication hub", () => {
  it("turns a request into one entry per step it reached", () => {
    const ev = requestEvents(request);
    expect(ev.map((e) => e.title)).toEqual([
      "Request received — Drywall",
      "Request marked contacted",
      "Request converted to a project",
    ]);
    expect(ev[0].detail).toBe("Fallbrook office · 1 Example St · Website form · Patch two walls");
    expect(ev.every((e) => e.path === "requests?request=r1")).toBe(true);
  });

  it("dates estimate milestones on their calendar day and links to the estimates tab", () => {
    const ev = estimateEvents({
      id: "e1",
      deal_id: "d1",
      version: 2,
      title: "Estimate",
      status: "accepted",
      total: 12500,
      created_at: "2026-11-02T10:00:00.000Z",
      sent_on: "2026-11-02",
      accepted_on: "2026-11-04",
      declined_on: null,
      dealTitle: "Kitchen",
    });
    expect(ev.map((e) => e.title)).toEqual([
      "Estimate created — Estimate v2",
      "Estimate sent — Estimate v2",
      "Estimate accepted — Estimate v2",
    ]);
    expect(ev[2]).toMatchObject({ at: "2026-11-04T12:00:00.000Z", dateOnly: true });
    expect(ev[0].detail).toBe("Kitchen · $12,500.00 · Accepted");
    expect(ev[0].path).toBe("projects/d1/estimates");
  });

  it("describes visits and projects", () => {
    expect(
      visitEvent({
        id: "v1",
        status: "scheduled",
        starts_at: "2026-11-05T17:00:00.000Z",
        office: "san_diego",
        address: null,
        notes: null,
        estimatorName: "Ana",
      }),
    ).toMatchObject({
      title: "Estimate visit — scheduled",
      detail: "San Diego office · Estimator: Ana",
    });
    const p = projectEvents({
      deal_id: "d1",
      dealTitle: "Kitchen",
      created_at: "2026-11-03T18:00:00.000Z",
      start_on: "2026-11-10",
      completed_on: null,
      job_address: "1 Example St",
    });
    expect(p.map((e) => e.title)).toEqual(["Project opened — Kitchen", "Work starts — Kitchen"]);
  });

  it("merges activities and record events newest first, without duplicates", () => {
    const calls = [
      { id: "a1", type: "call", occurredAt: "2026-11-02T00:00:00.000Z" },
      { id: "a1", type: "call", occurredAt: "2026-11-02T00:00:00.000Z" },
      { id: "a2", type: "note", occurredAt: "2026-11-04T00:00:00.000Z" },
      { id: "a3", type: "sms", occurredAt: "2026-10-30T00:00:00.000Z" },
    ];
    const merged = mergeHub(calls, [...requestEvents(request), ...requestEvents(request)]);
    expect(merged.map((m) => (m.source === "activity" ? m.activity.id : m.event.id))).toEqual([
      "a2",
      "request:r1:converted",
      "a1",
      "request:r1:contacted",
      "request:r1:submitted",
      "a3",
    ]);
    expect(merged.filter((m) => matchesFilter(m, "calls"))).toHaveLength(1);
    expect(merged.filter((m) => matchesFilter(m, "notes"))).toHaveLength(1);
    expect(merged.filter((m) => matchesFilter(m, "request"))).toHaveLength(3);
    expect(merged.filter((m) => matchesFilter(m, "texts"))).toHaveLength(1);
    expect(merged.filter((m) => matchesFilter(m, "all"))).toHaveLength(6);
  });
});
