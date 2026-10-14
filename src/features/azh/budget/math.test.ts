import { describe, expect, it } from "vitest";

import {
  adjustedContract,
  approvedChangeOrderTotal,
  budgetVsActual,
  pendingChangeOrderTotal,
} from "./math";

describe("change orders", () => {
  const orders = [
    { amount: 1200.5, status: "approved" },
    { amount: "-250.25", status: "approved" },
    { amount: 999, status: "pending" },
    { amount: 5000, status: "declined" },
  ];

  it("totals only approved change orders, credits included", () => {
    expect(approvedChangeOrderTotal(orders)).toBe(950.25);
    expect(pendingChangeOrderTotal(orders)).toBe(999);
  });

  it("adds approved change orders to the contract value", () => {
    expect(adjustedContract(48000, orders)).toBe(48950.25);
    expect(adjustedContract("0.10", [{ amount: 0.2, status: "approved" }])).toBe(0.3);
  });

  it("is null without a contract value and never negative", () => {
    expect(adjustedContract(null, orders)).toBeNull();
    expect(adjustedContract("", orders)).toBeNull();
    expect(adjustedContract(100, [{ amount: -500, status: "approved" }])).toBe(0);
  });
});

describe("budget vs actual", () => {
  it("computes variance per category and in total", () => {
    const s = budgetVsActual(
      [
        { category: "Framing", budgeted: 10000 },
        { category: "Drywall", budgeted: "4500.50" },
      ],
      [
        { category: "Framing", amount: 6000.1 },
        { category: "Framing", amount: 4500 },
        { category: "Drywall", amount: 1000 },
      ],
    );
    expect(s.rows).toEqual([
      { category: "Framing", budgeted: 10000, actual: 10500.1, variance: -500.1, pctUsed: 105 },
      { category: "Drywall", budgeted: 4500.5, actual: 1000, variance: 3500.5, pctUsed: 22.2 },
    ]);
    expect(s.totals).toEqual({
      budgeted: 14500.5,
      actual: 11500.1,
      variance: 3000.4,
      pctUsed: 79.3,
    });
  });

  it("shows spending in unbudgeted categories instead of hiding it", () => {
    const s = budgetVsActual(
      [{ category: "Paint", budgeted: 100 }],
      [
        { category: "Permits", amount: 75 },
        { category: "Dumpster", amount: 300 },
      ],
    );
    expect(s.rows.map((r) => r.category)).toEqual(["Paint", "Dumpster", "Permits"]);
    expect(s.rows[1]).toEqual({
      category: "Dumpster",
      budgeted: 0,
      actual: 300,
      variance: -300,
      pctUsed: null,
    });
  });

  it("handles an empty budget", () => {
    expect(budgetVsActual([], []).totals).toEqual({
      budgeted: 0,
      actual: 0,
      variance: 0,
      pctUsed: null,
    });
  });
});
