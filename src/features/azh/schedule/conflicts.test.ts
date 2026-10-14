import { describe, expect, it } from "vitest";

import { doubleBookedIds, findConflicts, overlaps } from "./conflicts";

const v = (
  id: string,
  estimatorId: string | null,
  start: string,
  end: string,
  status?: string,
) => ({
  id,
  estimatorId,
  startsAt: `2026-10-20T${start}:00-07:00`,
  endsAt: `2026-10-20T${end}:00-07:00`,
  status,
});

describe("double-booking detection", () => {
  it("treats back-to-back visits as free", () => {
    expect(overlaps(v("a", "e1", "09:00", "10:00"), v("b", "e1", "10:00", "11:00"))).toBe(false);
    expect(overlaps(v("a", "e1", "09:00", "10:01"), v("b", "e1", "10:00", "11:00"))).toBe(true);
  });

  it("flags overlapping visits for the same estimator only", () => {
    const existing = [
      v("x", "e1", "09:30", "10:30"),
      v("y", "e2", "09:30", "10:30"),
      v("z", "e1", "13:00", "14:00"),
    ];
    expect(findConflicts(v("new", "e1", "10:00", "11:00"), existing).map((c) => c.id)).toEqual([
      "x",
    ]);
  });

  it("ignores canceled visits, the visit itself and unassigned visits", () => {
    const existing = [
      v("x", "e1", "09:00", "12:00", "canceled"),
      v("same", "e1", "09:00", "12:00"),
    ];
    expect(findConflicts(v("same", "e1", "10:00", "11:00"), existing)).toEqual([]);
    expect(findConflicts(v("n", null, "10:00", "11:00"), [v("q", null, "10:00", "11:00")])).toEqual(
      [],
    );
  });

  it("detects a visit fully inside another", () => {
    expect(
      findConflicts(v("n", "e1", "10:15", "10:45"), [v("x", "e1", "10:00", "11:00")]),
    ).toHaveLength(1);
  });

  it("marks every double-booked visit in a week", () => {
    const ids = doubleBookedIds([
      v("a", "e1", "09:00", "10:00"),
      v("b", "e1", "09:30", "10:30"),
      v("c", "e1", "11:00", "12:00"),
      v("d", "e2", "09:00", "10:00"),
      v("e", "e1", "09:45", "10:15", "canceled"),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
