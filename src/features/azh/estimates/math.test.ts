import { describe, expect, it } from "vitest";

import { estimateTotals, lineTotalCents } from "./math";

describe("estimate math", () => {
  it("multiplies qty × unit price and rounds each line to the cent", () => {
    expect(lineTotalCents({ qty: 3, unitPrice: 19.99 })).toBe(BigInt(5997));
    expect(lineTotalCents({ qty: 1.333, unitPrice: 10 })).toBe(BigInt(1333));
    // 0.125 × 0.10 = 0.0125 → rounds half away from zero to 0.01
    expect(lineTotalCents({ qty: 0.125, unitPrice: 0.1 })).toBe(BigInt(1));
    // 2.5 × 0.01 = 0.025 → 0.03 (half away from zero, like Postgres round())
    expect(lineTotalCents({ qty: 2.5, unitPrice: 0.01 })).toBe(BigInt(3));
  });

  it("accepts strings from inputs and treats blanks as zero", () => {
    expect(lineTotalCents({ qty: "2", unitPrice: "1,5" as unknown as string })).toBe(BigInt(0));
    expect(lineTotalCents({ qty: "", unitPrice: 100 })).toBe(BigInt(0));
    expect(lineTotalCents({ qty: "4", unitPrice: "12.50" })).toBe(BigInt(5000));
  });

  it("avoids binary floating point drift", () => {
    // 0.1 + 0.2 style traps: 3 lines of $0.10 must be exactly $0.30
    const t = estimateTotals([
      { qty: 1, unitPrice: 0.1 },
      { qty: 1, unitPrice: 0.2 },
    ]);
    expect(t.subtotal).toBe(0.3);
    expect(estimateTotals([{ qty: 1, unitPrice: 1.005 }]).subtotal).toBe(1.01);
  });

  it("applies markup to the subtotal and tax to subtotal + markup", () => {
    const t = estimateTotals(
      [
        { qty: 120, unitPrice: 2.35 }, // 282.00
        { qty: 16, unitPrice: 65 }, // 1040.00
        { qty: 1, unitPrice: 349.99 }, // 349.99
      ],
      12.5,
      7.75,
    );
    expect(t.lineTotals).toEqual([282, 1040, 349.99]);
    expect(t.subtotal).toBe(1671.99);
    expect(t.markup).toBe(209); // 208.99875 → 209.00
    expect(t.tax).toBe(145.78); // (1880.99 × 7.75%) = 145.7767… → 145.78
    expect(t.total).toBe(2026.77);
  });

  it("handles empty estimates and zero percentages", () => {
    expect(estimateTotals([])).toEqual({
      lineTotals: [],
      subtotal: 0,
      markup: 0,
      tax: 0,
      total: 0,
    });
    const t = estimateTotals([{ qty: 2, unitPrice: 50 }], null, undefined);
    expect(t.total).toBe(100);
  });

  it("stays exact for large jobs", () => {
    const t = estimateTotals([{ qty: 1000, unitPrice: 99999.99 }], 10, 8.75);
    expect(t.subtotal).toBe(99999990);
    expect(t.markup).toBe(9999999);
    expect(t.tax).toBe(9624999.04); // 109999989 × 8.75% = 9624999.0375
    expect(t.total).toBe(119624988.04);
  });
});
