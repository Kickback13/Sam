import { centsToNumber, toCents } from "../money";

export type ChangeOrderLike = { amount: number | string; status: string };
export type BudgetLineLike = { category: string; budgeted: number | string };
export type CostLike = { category: string; amount: number | string };

/** Sum of approved change orders (credits are negative). */
export function approvedChangeOrderTotal(orders: ChangeOrderLike[]): number {
  return centsToNumber(
    orders
      .filter((o) => o.status === "approved")
      .reduce((s, o) => s + toCents(o.amount), BigInt(0)),
  );
}

export function pendingChangeOrderTotal(orders: ChangeOrderLike[]): number {
  return centsToNumber(
    orders.filter((o) => o.status === "pending").reduce((s, o) => s + toCents(o.amount), BigInt(0)),
  );
}

/**
 * Contract value + approved change orders, never below 0. Null when there is no
 * contract value yet. Mirrors app_private.azh_sync_deal_value.
 */
export function adjustedContract(
  contractValue: number | string | null | undefined,
  orders: ChangeOrderLike[],
): number | null {
  if (contractValue === null || contractValue === undefined || contractValue === "") return null;
  const cents = toCents(contractValue) + toCents(approvedChangeOrderTotal(orders));
  return centsToNumber(cents < BigInt(0) ? BigInt(0) : cents);
}

export type VarianceRow = {
  category: string;
  budgeted: number;
  actual: number;
  /** budgeted − actual: positive = under budget, negative = over budget. */
  variance: number;
  /** actual / budgeted × 100, or null when nothing is budgeted. */
  pctUsed: number | null;
};

export type BudgetSummary = {
  rows: VarianceRow[];
  totals: { budgeted: number; actual: number; variance: number; pctUsed: number | null };
};

/**
 * Budget vs. actual by category. Costs in a category with no budget line still
 * show up (budgeted 0) so nothing is hidden. Budget order is kept; extra
 * categories follow alphabetically.
 */
export function budgetVsActual(lines: BudgetLineLike[], costs: CostLike[]): BudgetSummary {
  const budget = new Map<string, bigint>();
  const order: string[] = [];
  for (const l of lines) {
    const key = l.category.trim();
    if (!budget.has(key)) order.push(key);
    budget.set(key, (budget.get(key) ?? BigInt(0)) + toCents(l.budgeted));
  }
  const actual = new Map<string, bigint>();
  for (const c of costs) {
    const key = c.category.trim();
    actual.set(key, (actual.get(key) ?? BigInt(0)) + toCents(c.amount));
  }
  const extra = [...actual.keys()].filter((k) => !budget.has(k)).sort((a, b) => a.localeCompare(b));

  const pct = (a: bigint, b: bigint) =>
    b === BigInt(0) ? null : Math.round((Number(a) / Number(b)) * 1000) / 10;

  const rows = [...order, ...extra].map((category) => {
    const b = budget.get(category) ?? BigInt(0);
    const a = actual.get(category) ?? BigInt(0);
    return {
      category,
      budgeted: centsToNumber(b),
      actual: centsToNumber(a),
      variance: centsToNumber(b - a),
      pctUsed: pct(a, b),
    };
  });
  const tb = [...budget.values()].reduce((s, v) => s + v, BigInt(0));
  const ta = [...actual.values()].reduce((s, v) => s + v, BigInt(0));
  return {
    rows,
    totals: {
      budgeted: centsToNumber(tb),
      actual: centsToNumber(ta),
      variance: centsToNumber(tb - ta),
      pctUsed: pct(ta, tb),
    },
  };
}
