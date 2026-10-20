import { centsToNumber, divRound, toCents, toScaled } from "../money";

/**
 * Estimate math (mirrors public.azh_save_estimate / app_private.azh_estimate_recalc):
 *   line_total = round(qty × unit_price, 2)
 *   subtotal   = Σ line_total
 *   markup     = round(subtotal × markup% / 100, 2)
 *   tax        = round((subtotal + markup) × tax% / 100, 2)
 *   total      = subtotal + markup + tax
 */
export type EstimateLineInput = {
  qty: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
};

export type EstimateTotals = {
  lineTotals: number[];
  subtotal: number;
  markup: number;
  tax: number;
  total: number;
};

export function lineTotalCents(line: EstimateLineInput): bigint {
  const qtyMilli = toScaled(line.qty, 3);
  const priceCents = toCents(line.unitPrice);
  return divRound(qtyMilli * priceCents, BigInt(1000));
}

function pctOf(amountCents: bigint, pct: number | string | null | undefined): bigint {
  const pctMilli = toScaled(pct, 3); // 8.75% → 8750
  return divRound(amountCents * pctMilli, BigInt(100000));
}

export function estimateTotals(
  lines: EstimateLineInput[],
  markupPct: number | string | null | undefined = 0,
  taxPct: number | string | null | undefined = 0,
): EstimateTotals {
  const lineCents = lines.map(lineTotalCents);
  const subtotal = lineCents.reduce((s, c) => s + c, BigInt(0));
  const markup = pctOf(subtotal, markupPct);
  const tax = pctOf(subtotal + markup, taxPct);
  return {
    lineTotals: lineCents.map(centsToNumber),
    subtotal: centsToNumber(subtotal),
    markup: centsToNumber(markup),
    tax: centsToNumber(tax),
    total: centsToNumber(subtotal + markup + tax),
  };
}
