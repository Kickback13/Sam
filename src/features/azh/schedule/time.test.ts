import { describe, expect, it } from "vitest";

import { addDays, weekStart, zonedDateTime, zonedParts } from "./time";

describe("San Diego wall-clock times", () => {
  it("converts summer (PDT) and winter (PST) times to UTC", () => {
    expect(zonedDateTime("2026-07-15", "09:30").toISOString()).toBe("2026-07-15T16:30:00.000Z");
    expect(zonedDateTime("2026-12-15", "09:30").toISOString()).toBe("2026-12-15T17:30:00.000Z");
  });

  it("handles the DST switch days", () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 PST→PDT; 10:00 is PDT.
    expect(zonedDateTime("2026-03-08", "10:00").toISOString()).toBe("2026-03-08T17:00:00.000Z");
    // 2026-11-01: back to PST; 10:00 is PST.
    expect(zonedDateTime("2026-11-01", "10:00").toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });

  it("round-trips back to local parts", () => {
    expect(zonedParts("2026-10-20T16:00:00.000Z")).toEqual({ date: "2026-10-20", time: "09:00" });
    expect(zonedParts(zonedDateTime("2026-01-05", "07:15"))).toEqual({
      date: "2026-01-05",
      time: "07:15",
    });
  });

  it("finds the Monday of a week and adds days", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12"); // Wednesday → Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → previous Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
