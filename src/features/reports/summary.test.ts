import { describe, expect, it } from "vitest";

import { parsePeriod, parseSummary, sumWeeks, winRate } from "./summary";

describe("reports summary", () => {
  it("parses the database shape and defaults anything missing to zero", () => {
    const s = parseSummary({
      days: 30,
      weeks: [{ week: "2026-11-02", contacts: 3, calls: "2" }],
      stages: [{ id: "s", name: "New Deal", color: "nope", open_count: 4, open_value: "1000.50" }],
      closed: { won: 1, lost: 3 },
      requests: [{ office: "fallbrook", status: "new", n: 2 }],
    });
    expect(s.weeks[0]).toMatchObject({ contacts: 3, calls: 2, texts: 0 });
    expect(s.stages[0]).toMatchObject({ color: "#64748B", open_value: 1000.5 });
    expect(s.closed).toEqual({ won: 1, won_value: 0, lost: 3 });
    expect(s.tasks).toEqual({ done: 0, open: 0, overdue: 0 });
    expect(s.requests).toHaveLength(1);
    expect(parseSummary(null).weeks).toEqual([]);
  });

  it("win rate, totals and periods", () => {
    expect(winRate(1, 3)).toBe(25);
    expect(winRate(0, 0)).toBeNull();
    expect(sumWeeks(parseSummary({ weeks: [{ calls: 2 }, { calls: 5 }] }).weeks, "calls")).toBe(7);
    expect(parsePeriod("365")).toBe(365);
    expect(parsePeriod("12")).toBe(90);
    expect(parsePeriod(undefined)).toBe(90);
  });
});
