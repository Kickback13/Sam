import { describe, expect, it } from "vitest";
import { median, redFlags } from "./flags";
import { EMPTY_INPUTS, underwrite, type UnderwritingInputs } from "./math";

const base: UnderwritingInputs = {
  ...EMPTY_INPUTS,
  price: 2_000_000,
  units: 8,
  unitMix: [
    { label: "2BR", count: 4, monthlyRent: 2_000 },
    { label: "3BR", count: 4, monthlyRent: 2_500 },
  ],
  vacancyPct: 5,
  taxRatePct: 1.2,
  insurance: 8_000,
  utilities: 12_000,
  repairs: 9_000,
  managementPct: 4,
  otherExpenses: 2_000,
  ltvPct: 65,
  interestRatePct: 6,
  amortYears: 30,
};

const ids = (i: UnderwritingInputs, ctx = {}) => redFlags(i, underwrite(i), ctx).map((f) => f.id);

describe("redFlags", () => {
  it("a healthy deal raises nothing", () => {
    expect(ids(base)).toEqual([]);
  });

  it("DSCR below 1 is danger; below 1.25 is a warning", () => {
    // 90% LTV at 9%: DSCR ≈ 0.82; 80% at 6%: DSCR ≈ 1.23
    expect(ids({ ...base, ltvPct: 90, interestRatePct: 9 })).toContain("dscr_below_1");
    expect(ids({ ...base, ltvPct: 80 })).toContain("dscr_low");
  });

  it("negative cash flow", () => {
    expect(ids({ ...base, ltvPct: 90, interestRatePct: 9 })).toContain("negative_cash_flow");
  });

  it("negative leverage when cap rate < interest rate", () => {
    expect(ids({ ...base, interestRatePct: 8 })).toContain("negative_leverage");
    expect(ids({ ...base, ltvPct: 0, interestRatePct: 8 })).not.toContain("negative_leverage");
  });

  it("expense ratio low / high", () => {
    expect(
      ids({
        ...base,
        insurance: null,
        utilities: null,
        repairs: null,
        otherExpenses: null,
        managementPct: 0,
        taxRatePct: 1,
      }),
    ).toContain("expenses_low");
    expect(ids({ ...base, utilities: 100_000 })).toContain("expenses_high");
  });

  it("vacancy under 3% is optimistic", () => {
    expect(ids({ ...base, vacancyPct: 2 })).toContain("vacancy_low");
    expect(ids({ ...base, vacancyPct: 3 })).not.toContain("vacancy_low");
  });

  it("Prop 13: a tax rate under 1% is danger", () => {
    const flags = redFlags({ ...base, taxRatePct: 0.4 }, underwrite({ ...base, taxRatePct: 0.4 }));
    expect(flags[0].id).toBe("tax_below_prop13");
    expect(flags[0].level).toBe("danger");
    expect(ids({ ...base, taxRatePct: 1 })).not.toContain("tax_below_prop13");
  });

  it("no management fee on 5+ units is info only", () => {
    expect(ids({ ...base, managementPct: null })).toContain("no_management");
    expect(
      ids({ ...base, managementPct: null, units: 4, unitMix: [], monthlyRentTotal: 18_000 }),
    ).not.toContain("no_management");
  });

  it("unit mix that doesn't match the unit count", () => {
    expect(ids({ ...base, units: 10 })).toContain("unit_mix_mismatch");
  });

  it("price per unit more than 20% above the sale-comp median", () => {
    expect(ids(base, { saleCompMedianPricePerUnit: 200_000, saleCompCount: 3 })).toContain(
      "above_comps",
    );
    expect(ids(base, { saleCompMedianPricePerUnit: 210_000, saleCompCount: 3 })).not.toContain(
      "above_comps",
    );
  });

  it("listing verification: mismatch is danger, unverified is info", () => {
    expect(ids(base, { verificationStatus: "mismatch" })).toContain("verification_mismatch");
    expect(ids(base, { verificationStatus: "unverified" })).toContain("unverified");
    expect(ids(base, { verificationStatus: "verified" })).toEqual([]);
  });

  it("sorts danger first", () => {
    const levels = redFlags(
      { ...base, ltvPct: 95, vacancyPct: 1 },
      underwrite({ ...base, ltvPct: 95, vacancyPct: 1 }),
    ).map((f) => f.level);
    expect(levels).toEqual(
      [...levels].sort(
        (a, b) =>
          ["danger", "warning", "info"].indexOf(a) - ["danger", "warning", "info"].indexOf(b),
      ),
    );
  });

  it("missing inputs raise nothing (they show as Needs input instead)", () => {
    expect(ids(EMPTY_INPUTS)).toEqual([]);
  });
});

describe("median", () => {
  it("odd, even, ignores non-positive", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([0, -1])).toBeNull();
  });
});
