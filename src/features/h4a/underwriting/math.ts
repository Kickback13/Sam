/**
 * Underwriting math (pure). The single source of truth for the analysis page,
 * the saved scenarios and the PDF, so the screen and the PDF can't disagree.
 *
 * Rules
 *  - Nothing is assumed. A metric whose inputs are missing has value null and
 *    lists what it needs ("Needs input"). Optional add-ons (other income,
 *    individual expense lines, closing costs) count as $0 when left blank and
 *    the formula says so.
 *  - Property tax is a rate of the price: California reassesses at sale
 *    (Prop 13), so the seller's current bill is not the buyer's.
 *  - Vacancy applies to scheduled rent; other income is added after it.
 *  - Management is a % of effective gross income.
 *  - Loan payment: standard fixed-rate amortization, paid monthly.
 *  - Money is rounded to cents, percentages to 2 decimals, ratios to 2 decimals.
 */

export type UnitMixRow = { label: string; count: number; monthlyRent: number };

export type UnderwritingInputs = {
  price: number | null;
  units: number | null;
  buildingSqft: number | null;
  /** When it has rows, scheduled rent comes from it; otherwise from monthlyRentTotal. */
  unitMix: UnitMixRow[];
  monthlyRentTotal: number | null;
  otherIncomeMonthly: number | null;
  vacancyPct: number | null;
  expenseMode: "itemized" | "ratio";
  taxRatePct: number | null;
  insurance: number | null;
  utilities: number | null;
  repairs: number | null;
  managementPct: number | null;
  payroll: number | null;
  otherExpenses: number | null;
  expenseRatioPct: number | null;
  ltvPct: number | null;
  interestRatePct: number | null;
  amortYears: number | null;
  closingCosts: number | null;
};

export type InputKey = keyof UnderwritingInputs;

export const INPUT_LABELS: Record<InputKey, string> = {
  price: "Price",
  units: "Units",
  buildingSqft: "Building sq ft",
  unitMix: "Unit mix",
  monthlyRentTotal: "Total monthly rent",
  otherIncomeMonthly: "Other income (monthly)",
  vacancyPct: "Vacancy %",
  expenseMode: "Expense method",
  taxRatePct: "Property tax rate %",
  insurance: "Insurance (annual)",
  utilities: "Utilities (annual)",
  repairs: "Repairs & maintenance (annual)",
  managementPct: "Management % of income",
  payroll: "Payroll (annual)",
  otherExpenses: "Other expenses (annual)",
  expenseRatioPct: "Expense ratio %",
  ltvPct: "Loan-to-value %",
  interestRatePct: "Interest rate %",
  amortYears: "Amortization (years)",
  closingCosts: "Closing costs",
};

export const EMPTY_INPUTS: UnderwritingInputs = {
  price: null,
  units: null,
  buildingSqft: null,
  unitMix: [],
  monthlyRentTotal: null,
  otherIncomeMonthly: null,
  vacancyPct: null,
  expenseMode: "itemized",
  taxRatePct: null,
  insurance: null,
  utilities: null,
  repairs: null,
  managementPct: null,
  payroll: null,
  otherExpenses: null,
  expenseRatioPct: null,
  ltvPct: null,
  interestRatePct: null,
  amortYears: null,
  closingCosts: null,
};

export type MetricKey =
  | "pricePerUnit"
  | "pricePerSqft"
  | "grossScheduledRent"
  | "vacancyLoss"
  | "otherIncome"
  | "effectiveGrossIncome"
  | "propertyTax"
  | "management"
  | "operatingExpenses"
  | "expenseRatio"
  | "noi"
  | "capRate"
  | "grm"
  | "loanAmount"
  | "annualDebtService"
  | "dscr"
  | "cashFlow"
  | "cashInvested"
  | "cashOnCash"
  | "breakEvenOccupancy";

export type MetricKind = "money" | "percent" | "ratio";

export type Metric = {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  /** null when an input is missing (see `missing`) or the result is undefined (e.g. no loan → no DSCR). */
  value: number | null;
  /** Plain-words formula, e.g. "NOI ÷ price". */
  formula: string;
  /** Inputs this metric depends on, directly or through other metrics. */
  inputs: InputKey[];
  /** Inputs that must be filled in for a value. */
  missing: InputKey[];
  /** Why the value is null when nothing is missing (e.g. "No loan"). */
  note?: string;
};

export type Underwriting = Record<MetricKey, Metric>;

const has = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const money = (n: number) => Math.round(n * 100) / 100;
const pct2 = (n: number) => Math.round(n * 100) / 100;
const orZero = (n: number | null) => (has(n) ? n : 0);
const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** Monthly payment on a fixed-rate, fully amortizing loan. */
export function monthlyPayment(loan: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0) return NaN;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

type Part = { value: number | null; inputs: InputKey[]; missing: InputKey[]; note?: string };

const ok = (value: number, inputs: InputKey[]): Part => ({
  value,
  inputs: uniq(inputs),
  missing: [],
});
const need = (inputs: InputKey[], missing: InputKey[]): Part => ({
  value: null,
  inputs: uniq(inputs),
  missing: uniq(missing),
});
const combine = (parts: Part[], f: (...v: number[]) => number, extra: InputKey[] = []): Part => {
  const inputs = uniq([...extra, ...parts.flatMap((p) => p.inputs)]);
  const missing = uniq(parts.flatMap((p) => p.missing));
  if (missing.length || parts.some((p) => p.value === null)) {
    const note = parts.find((p) => p.note)?.note;
    return { value: null, inputs, missing, note };
  }
  const v = f(...parts.map((p) => p.value as number));
  return Number.isFinite(v)
    ? { value: v, inputs, missing: [] }
    : { value: null, inputs, missing: [] };
};
const input = (i: UnderwritingInputs, key: InputKey, positive = false): Part => {
  const v = i[key] as number | null;
  if (!has(v) || (positive && v <= 0)) return need([key], [key]);
  return ok(v, [key]);
};
const optional = (i: UnderwritingInputs, key: InputKey): Part =>
  ok(orZero(i[key] as number | null), [key]);

export function underwrite(i: UnderwritingInputs): Underwriting {
  const price = input(i, "price", true);
  const units = input(i, "units", true);
  const sqft = input(i, "buildingSqft", true);

  const mix = i.unitMix.filter((r) => has(r.count) && r.count > 0 && has(r.monthlyRent));
  const gsr: Part = mix.length
    ? ok(mix.reduce((s, r) => s + r.count * r.monthlyRent, 0) * 12, ["unitMix"])
    : has(i.monthlyRentTotal)
      ? ok(i.monthlyRentTotal * 12, ["monthlyRentTotal"])
      : need(["unitMix", "monthlyRentTotal"], ["monthlyRentTotal"]);

  const vacancyPct = input(i, "vacancyPct");
  const vacancyLoss = combine([gsr, vacancyPct], (g, v) => (g * v) / 100);
  const otherIncome = combine([optional(i, "otherIncomeMonthly")], (o) => o * 12);
  const egi = combine([gsr, vacancyLoss, otherIncome], (g, v, o) => g - v + o);

  const propertyTax = combine([price, input(i, "taxRatePct")], (p, t) => (p * t) / 100);
  const management = combine([egi, optional(i, "managementPct")], (e, m) => (e * m) / 100);

  const opex =
    i.expenseMode === "ratio"
      ? combine([egi, input(i, "expenseRatioPct")], (e, r) => (e * r) / 100)
      : combine(
          [
            propertyTax,
            optional(i, "insurance"),
            optional(i, "utilities"),
            optional(i, "repairs"),
            management,
            optional(i, "payroll"),
            optional(i, "otherExpenses"),
          ],
          (...xs) => xs.reduce((s, x) => s + x, 0),
          ["expenseMode"],
        );

  const expenseRatio = combine([opex, egi], (o, e) => (e > 0 ? (o / e) * 100 : NaN));
  const noi = combine([egi, opex], (e, o) => e - o);
  const capRate = combine([noi, price], (n, p) => (n / p) * 100);
  const grm = combine([price, gsr], (p, g) => (g > 0 ? p / g : NaN));

  const ltv = input(i, "ltvPct");
  const loanAmount = combine([price, ltv], (p, l) => (p * l) / 100);
  const debtInputs: InputKey[] = ["ltvPct", "interestRatePct", "amortYears"];
  let ads: Part;
  if (loanAmount.value === 0) {
    ads = ok(0, uniq([...loanAmount.inputs]));
  } else {
    ads = combine(
      [loanAmount, input(i, "interestRatePct"), input(i, "amortYears", true)],
      (l, r, y) => monthlyPayment(l, r, y) * 12,
    );
  }
  const dscr: Part =
    ads.value === 0
      ? {
          value: null,
          inputs: uniq([...noi.inputs, ...ads.inputs]),
          missing: noi.missing,
          note: "No loan",
        }
      : combine([noi, ads], (n, d) => n / d);
  const cashFlow = combine([noi, ads], (n, d) => n - d);
  const cashInvested = combine(
    [price, loanAmount, optional(i, "closingCosts")],
    (p, l, c) => p - l + c,
  );
  const cashOnCash = combine([cashFlow, cashInvested], (f, c) => (c > 0 ? (f / c) * 100 : NaN));
  const breakEven = combine([opex, ads, gsr, otherIncome], (o, d, g, oi) =>
    g + oi > 0 ? ((o + d) / (g + oi)) * 100 : NaN,
  );

  const m = (
    key: MetricKey,
    label: string,
    kind: MetricKind,
    part: Part,
    formula: string,
  ): Metric => ({
    key,
    label,
    kind,
    value: part.value === null ? null : kind === "money" ? money(part.value) : pct2(part.value),
    formula,
    inputs: part.inputs,
    missing: part.missing,
    ...(part.note && part.value === null ? { note: part.note } : {}),
  });

  const expenseFormula =
    i.expenseMode === "ratio"
      ? "Effective gross income × expense ratio %"
      : "Property tax + insurance + utilities + repairs + management + payroll + other (blank lines count as $0)";

  return {
    pricePerUnit: m(
      "pricePerUnit",
      "Price per unit",
      "money",
      combine([price, units], (p, u) => p / u),
      "Price ÷ units",
    ),
    pricePerSqft: m(
      "pricePerSqft",
      "Price per sq ft",
      "money",
      combine([price, sqft], (p, s) => p / s),
      "Price ÷ building sq ft",
    ),
    grossScheduledRent: m(
      "grossScheduledRent",
      "Gross scheduled rent (annual)",
      "money",
      gsr,
      mix.length ? "Σ (units × monthly rent) × 12" : "Total monthly rent × 12",
    ),
    vacancyLoss: m(
      "vacancyLoss",
      "Vacancy loss",
      "money",
      vacancyLoss,
      "Gross scheduled rent × vacancy %",
    ),
    otherIncome: m(
      "otherIncome",
      "Other income (annual)",
      "money",
      otherIncome,
      "Other monthly income × 12 (blank counts as $0)",
    ),
    effectiveGrossIncome: m(
      "effectiveGrossIncome",
      "Effective gross income",
      "money",
      egi,
      "Gross scheduled rent − vacancy loss + other income",
    ),
    propertyTax: m(
      "propertyTax",
      "Property tax (annual)",
      "money",
      propertyTax,
      "Price × tax rate % (reassessed at sale)",
    ),
    management: m(
      "management",
      "Management (annual)",
      "money",
      management,
      "Effective gross income × management % (blank counts as 0%)",
    ),
    operatingExpenses: m(
      "operatingExpenses",
      "Operating expenses (annual)",
      "money",
      opex,
      expenseFormula,
    ),
    expenseRatio: m(
      "expenseRatio",
      "Expense ratio",
      "percent",
      expenseRatio,
      "Operating expenses ÷ effective gross income",
    ),
    noi: m(
      "noi",
      "Net operating income (NOI)",
      "money",
      noi,
      "Effective gross income − operating expenses",
    ),
    capRate: m("capRate", "Cap rate", "percent", capRate, "NOI ÷ price"),
    grm: m("grm", "Gross rent multiplier", "ratio", grm, "Price ÷ gross scheduled rent"),
    loanAmount: m("loanAmount", "Loan amount", "money", loanAmount, "Price × loan-to-value %"),
    annualDebtService: m(
      "annualDebtService",
      "Annual debt service",
      "money",
      { ...ads, inputs: uniq([...ads.inputs, ...(ads.value === 0 ? [] : debtInputs)]) },
      "Monthly payment × 12 (fixed rate, fully amortizing)",
    ),
    dscr: m("dscr", "Debt service coverage (DSCR)", "ratio", dscr, "NOI ÷ annual debt service"),
    cashFlow: m(
      "cashFlow",
      "Cash flow before tax (annual)",
      "money",
      cashFlow,
      "NOI − annual debt service",
    ),
    cashInvested: m(
      "cashInvested",
      "Cash invested",
      "money",
      cashInvested,
      "Price − loan amount + closing costs (blank counts as $0)",
    ),
    cashOnCash: m(
      "cashOnCash",
      "Cash-on-cash return",
      "percent",
      cashOnCash,
      "Cash flow ÷ cash invested",
    ),
    breakEvenOccupancy: m(
      "breakEvenOccupancy",
      "Break-even occupancy",
      "percent",
      breakEven,
      "(Operating expenses + debt service) ÷ (gross scheduled rent + other income)",
    ),
  };
}

/** Display order on the analysis page and in the PDF. */
export const METRIC_GROUPS: { title: string; keys: MetricKey[] }[] = [
  { title: "Price", keys: ["pricePerUnit", "pricePerSqft", "grm"] },
  {
    title: "Income",
    keys: ["grossScheduledRent", "vacancyLoss", "otherIncome", "effectiveGrossIncome"],
  },
  {
    title: "Expenses",
    keys: ["propertyTax", "management", "operatingExpenses", "expenseRatio"],
  },
  { title: "Returns", keys: ["noi", "capRate", "cashFlow", "cashOnCash"] },
  {
    title: "Financing",
    keys: ["loanAmount", "annualDebtService", "dscr", "cashInvested", "breakEvenOccupancy"],
  },
];
