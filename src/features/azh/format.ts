const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.56" — AZH money shows cents (the shared formatCurrency rounds to dollars). */
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? usdCents.format(n) : "—";
}
