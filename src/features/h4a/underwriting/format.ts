import { formatCurrency } from "@/lib/format";

import type { Metric } from "./math";

const twoDp = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Metric value for the screen and the PDF (same function, so they match). */
export function formatMetric(m: Pick<Metric, "kind" | "value">): string {
  if (m.value === null) return "—";
  switch (m.kind) {
    case "money":
      // Whole dollars for big amounts; cents only matter on small ones (price per sq ft).
      return Math.abs(m.value) >= 1000 ? formatCurrency(m.value) : money2.format(m.value);
    case "percent":
      return `${twoDp.format(m.value)}%`;
    case "ratio":
      return `${twoDp.format(m.value)}×`;
  }
}
