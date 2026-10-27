import { describe, expect, it } from "vitest";
import { EMPTY_INPUTS, monthlyPayment, underwrite, type UnderwritingInputs } from "./math";

// Worked example, checked by hand:
//   8 units, $2,000,000, 6,400 sq ft
//   rent: 4 × $2,000 + 4 × $2,500 = $18,000/mo → GSR $216,000
//   vacancy 5% → $10,800; other income $300/mo → $3,600; EGI $208,800
//   tax 1.2% of price $24,000; insurance $8,000; utilities $12,000; repairs $9,000;
//   management 4% of EGI $8,352; payroll blank; other $2,000 → opex $63,352
//   NOI $145,448; cap 7.27%; GRM 9.26; expense ratio 30.34%
//   loan 65% = $1,300,000 at 6% / 30 yrs → $7,794.16/mo → $93,529.88/yr
//   DSCR 1.56; cash flow $51,918.12; cash invested $740,000 → CoC 7.02%
//   break-even (63,352 + 93,529.88) ÷ 219,600 = 71.44%
const example: UnderwritingInputs = {
  ...EMPTY_INPUTS,
  price: 2_000_000,
  units: 8,
  buildingSqft: 6_400,
  unitMix: [
    { label: "2BR", count: 4, monthlyRent: 2_000 },
    { label: "3BR", count: 4, monthlyRent: 2_500 },
  ],
  otherIncomeMonthly: 300,
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
  closingCosts: 40_000,
};

describe("monthlyPayment", () => {
  it("matches the standard amortization table ($100k, 6%, 30 yrs = $599.55)", () => {
    expect(monthlyPayment(100_000, 6, 30)).toBeCloseTo(599.55, 2);
  });
  it("handles a 0% rate as straight-line", () => {
    expect(monthlyPayment(120_000, 0, 10)).toBe(1_000);
  });
});

describe("underwrite — worked example", () => {
  const u = underwrite(example);
  it.each([
    ["pricePerUnit", 250_000],
    ["pricePerSqft", 312.5],
    ["grossScheduledRent", 216_000],
    ["vacancyLoss", 10_800],
    ["otherIncome", 3_600],
    ["effectiveGrossIncome", 208_800],
    ["propertyTax", 24_000],
    ["management", 8_352],
    ["operatingExpenses", 63_352],
    ["expenseRatio", 30.34],
    ["noi", 145_448],
    ["capRate", 7.27],
    ["grm", 9.26],
    ["loanAmount", 1_300_000],
    ["annualDebtService", 93_529.88],
    ["dscr", 1.56],
    ["cashFlow", 51_918.12],
    ["cashInvested", 740_000],
    ["cashOnCash", 7.02],
    ["breakEvenOccupancy", 71.44],
  ] as const)("%s = %s", (key, expected) => {
    expect(u[key].value).toBe(expected);
    expect(u[key].missing).toEqual([]);
  });

  it("traces NOI back to every input it used", () => {
    expect(u.noi.inputs).toEqual(
      expect.arrayContaining([
        "unitMix",
        "vacancyPct",
        "otherIncomeMonthly",
        "price",
        "taxRatePct",
        "insurance",
        "managementPct",
      ]),
    );
    expect(u.noi.inputs).not.toContain("ltvPct");
  });
});

describe("underwrite — missing inputs are never assumed", () => {
  it("empty inputs give no numbers, only what's needed", () => {
    const u = underwrite(EMPTY_INPUTS);
    expect(u.noi.value).toBeNull();
    expect(u.capRate.value).toBeNull();
    expect(u.capRate.missing).toEqual(
      expect.arrayContaining(["price", "monthlyRentTotal", "vacancyPct", "taxRatePct"]),
    );
    expect(u.pricePerUnit.missing).toEqual(["price", "units"]);
  });

  it("blank vacancy blocks income-based metrics", () => {
    const u = underwrite({ ...example, vacancyPct: null });
    expect(u.grossScheduledRent.value).toBe(216_000);
    expect(u.effectiveGrossIncome.value).toBeNull();
    expect(u.effectiveGrossIncome.missing).toEqual(["vacancyPct"]);
    expect(u.pricePerUnit.value).toBe(250_000);
  });

  it("blank tax rate blocks itemized expenses (taxes always exist)", () => {
    const u = underwrite({ ...example, taxRatePct: null });
    expect(u.operatingExpenses.value).toBeNull();
    expect(u.operatingExpenses.missing).toEqual(["taxRatePct"]);
  });

  it("zero units or price is treated as missing, not divided by", () => {
    expect(underwrite({ ...example, units: 0 }).pricePerUnit.missing).toEqual(["units"]);
    expect(underwrite({ ...example, price: 0 }).capRate.value).toBeNull();
  });
});

describe("underwrite — options", () => {
  it("uses total monthly rent when there's no unit mix", () => {
    const u = underwrite({ ...example, unitMix: [], monthlyRentTotal: 18_000 });
    expect(u.grossScheduledRent.value).toBe(216_000);
    expect(u.grossScheduledRent.inputs).toEqual(["monthlyRentTotal"]);
    expect(u.noi.value).toBe(145_448);
  });

  it("ratio mode: expenses = EGI × ratio", () => {
    const u = underwrite({
      ...example,
      expenseMode: "ratio",
      expenseRatioPct: 35,
      taxRatePct: null,
    });
    expect(u.operatingExpenses.value).toBe(73_080);
    expect(u.noi.value).toBe(135_720);
    expect(u.operatingExpenses.inputs).not.toContain("taxRatePct");
  });

  it("all cash (0% LTV): no debt service, no DSCR, cash flow = NOI", () => {
    const u = underwrite({ ...example, ltvPct: 0, interestRatePct: null, amortYears: null });
    expect(u.annualDebtService.value).toBe(0);
    expect(u.dscr.value).toBeNull();
    expect(u.dscr.note).toBe("No loan");
    expect(u.cashFlow.value).toBe(145_448);
    expect(u.cashInvested.value).toBe(2_040_000);
  });

  it("blank loan-to-value: financing needs input, operations still compute", () => {
    const u = underwrite({ ...example, ltvPct: null });
    expect(u.noi.value).toBe(145_448);
    expect(u.dscr.value).toBeNull();
    expect(u.dscr.missing).toEqual(["ltvPct"]);
  });
});
