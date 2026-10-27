/**
 * Red flags (pure). Plain-words warnings on an underwriting, so nothing
 * optimistic slips through. Every flag names the numbers it looked at.
 *
 * Thresholds are rules of thumb, not lender quotes — they're constants here so
 * Sam can tune them, and the wording says "check", not "wrong".
 */
import { formatCurrency } from "@/lib/format";
import type { InputKey, MetricKey, Underwriting, UnderwritingInputs } from "./math";

export const FLAG_RULES = {
  /** Many multifamily lenders size loans to roughly 1.20–1.25× coverage. */
  minDscr: 1.25,
  /** Apartment operating expenses usually run well above this share of income. */
  lowExpenseRatioPct: 25,
  highExpenseRatioPct: 60,
  /** Underwriting below this vacancy is optimistic. */
  minVacancyPct: 3,
  /** California's base property tax rate (Prop 13); local add-ons only raise it. */
  caBaseTaxRatePct: 1,
  /** Price per unit this far above the sale-comp median gets a warning. */
  compPremiumPct: 20,
} as const;

export type FlagLevel = "danger" | "warning" | "info";

export type RedFlag = {
  id: string;
  level: FlagLevel;
  title: string;
  detail: string;
  metrics: MetricKey[];
  inputs: InputKey[];
};

export type FlagContext = {
  /** Median price per unit of the sale comps, when there are any. */
  saleCompMedianPricePerUnit?: number | null;
  saleCompCount?: number;
  /** Deal Finder verification of the source listing, when there is one. */
  verificationStatus?: "unverified" | "verified" | "mismatch" | null;
};

const fmtPct = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, "")}%`;

export function redFlags(
  inputs: UnderwritingInputs,
  u: Underwriting,
  ctx: FlagContext = {},
): RedFlag[] {
  const flags: RedFlag[] = [];
  const add = (f: RedFlag) => flags.push(f);

  const dscr = u.dscr.value;
  if (dscr !== null && dscr < 1) {
    add({
      id: "dscr_below_1",
      level: "danger",
      title: "NOI doesn't cover the loan payment",
      detail: `DSCR is ${dscr.toFixed(2)}: the property earns less than its debt service.`,
      metrics: ["dscr", "noi", "annualDebtService"],
      inputs: ["ltvPct", "interestRatePct", "amortYears"],
    });
  } else if (dscr !== null && dscr < FLAG_RULES.minDscr) {
    add({
      id: "dscr_low",
      level: "warning",
      title: "Thin debt coverage",
      detail: `DSCR is ${dscr.toFixed(2)}. Many multifamily lenders want about ${FLAG_RULES.minDscr.toFixed(2)} or more — check the loan size.`,
      metrics: ["dscr"],
      inputs: ["ltvPct", "interestRatePct", "amortYears"],
    });
  }

  if (u.cashFlow.value !== null && u.cashFlow.value < 0) {
    add({
      id: "negative_cash_flow",
      level: "danger",
      title: "Negative cash flow",
      detail: `Cash flow before tax is ${formatCurrency(u.cashFlow.value)} a year.`,
      metrics: ["cashFlow"],
      inputs: [],
    });
  }

  const cap = u.capRate.value;
  if (
    cap !== null &&
    inputs.interestRatePct !== null &&
    (inputs.ltvPct ?? 0) > 0 &&
    cap < inputs.interestRatePct
  ) {
    add({
      id: "negative_leverage",
      level: "warning",
      title: "Negative leverage",
      detail: `The cap rate (${fmtPct(cap)}) is below the interest rate (${fmtPct(inputs.interestRatePct)}), so borrowing lowers the return.`,
      metrics: ["capRate"],
      inputs: ["interestRatePct"],
    });
  }

  const er = u.expenseRatio.value;
  if (er !== null && er < FLAG_RULES.lowExpenseRatioPct) {
    add({
      id: "expenses_low",
      level: "warning",
      title: "Expenses look low",
      detail: `Expenses are ${fmtPct(er)} of income, low for apartments. Check for missing lines (management, repairs, reserves, utilities).`,
      metrics: ["expenseRatio", "operatingExpenses"],
      inputs: [],
    });
  } else if (er !== null && er > FLAG_RULES.highExpenseRatioPct) {
    add({
      id: "expenses_high",
      level: "warning",
      title: "Expenses look high",
      detail: `Expenses are ${fmtPct(er)} of income. Check for one-time costs counted as yearly.`,
      metrics: ["expenseRatio", "operatingExpenses"],
      inputs: [],
    });
  }

  if (inputs.vacancyPct !== null && inputs.vacancyPct < FLAG_RULES.minVacancyPct) {
    add({
      id: "vacancy_low",
      level: "warning",
      title: "Optimistic vacancy",
      detail: `Vacancy is set to ${fmtPct(inputs.vacancyPct)}. Below ${FLAG_RULES.minVacancyPct}% leaves no room for turnover.`,
      metrics: ["vacancyLoss"],
      inputs: ["vacancyPct"],
    });
  }

  if (
    inputs.expenseMode === "itemized" &&
    inputs.taxRatePct !== null &&
    inputs.taxRatePct < FLAG_RULES.caBaseTaxRatePct
  ) {
    add({
      id: "tax_below_prop13",
      level: "danger",
      title: "Property tax below California's 1% base rate",
      detail: `The tax rate is ${fmtPct(inputs.taxRatePct)}. California reassesses at sale (Prop 13), so the new owner pays at least 1% of the price plus local charges — the seller's current bill doesn't carry over.`,
      metrics: ["propertyTax"],
      inputs: ["taxRatePct"],
    });
  }

  if (
    inputs.expenseMode === "itemized" &&
    !inputs.managementPct &&
    inputs.units !== null &&
    inputs.units >= 5
  ) {
    add({
      id: "no_management",
      level: "info",
      title: "No management fee",
      detail: "Fine if Sam self-manages, but lenders and future buyers usually underwrite one.",
      metrics: ["management"],
      inputs: ["managementPct"],
    });
  }

  const mixUnits = inputs.unitMix.reduce((s, r) => s + (r.count > 0 ? r.count : 0), 0);
  if (inputs.unitMix.length && inputs.units !== null && mixUnits !== inputs.units) {
    add({
      id: "unit_mix_mismatch",
      level: "warning",
      title: "Unit mix doesn't add up",
      detail: `The unit mix has ${mixUnits} units but the property has ${inputs.units}.`,
      metrics: ["grossScheduledRent"],
      inputs: ["unitMix", "units"],
    });
  }

  const ppu = u.pricePerUnit.value;
  const median = ctx.saleCompMedianPricePerUnit ?? null;
  if (ppu !== null && median !== null && median > 0) {
    const premium = ((ppu - median) / median) * 100;
    if (premium > FLAG_RULES.compPremiumPct) {
      add({
        id: "above_comps",
        level: "warning",
        title: "Priced above the comps",
        detail: `${formatCurrency(ppu)} per unit is ${Math.round(premium)}% above the median of ${ctx.saleCompCount ?? "the"} sale comps (${formatCurrency(median)}).`,
        metrics: ["pricePerUnit"],
        inputs: ["price", "units"],
      });
    }
  }

  if (ctx.verificationStatus === "mismatch") {
    add({
      id: "verification_mismatch",
      level: "danger",
      title: "Listing facts don't match the records",
      detail:
        "The source listing was marked Mismatch in the Deal Finder. Fix the facts before relying on these numbers.",
      metrics: [],
      inputs: ["units", "price"],
    });
  } else if (ctx.verificationStatus === "unverified") {
    add({
      id: "unverified",
      level: "info",
      title: "Facts not verified yet",
      detail: "The source listing hasn't been checked against county records.",
      metrics: [],
      inputs: ["units"],
    });
  }

  const order: Record<FlagLevel, number> = { danger: 0, warning: 1, info: 2 };
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}

/** Median of positive numbers, or null. */
export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
