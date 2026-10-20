/**
 * Exact money helpers. Amounts are handled as integer cents (BigInt for
 * intermediate products) and rounded half away from zero — the same rule as
 * Postgres numeric round(), so app math matches the database to the cent.
 */

/** n / d rounded half away from zero (d > 0). */
export function divRound(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0)) throw new Error("divisor must be positive");
  if (n >= BigInt(0)) return (n * BigInt(2) + d) / (BigInt(2) * d);
  return -((-n * BigInt(2) + d) / (BigInt(2) * d));
}

/** Scale a decimal to an integer with `places` decimals (e.g. 12.345, 3 → BigInt(12345)). */
export function toScaled(value: number | string | null | undefined, places: number): bigint {
  if (value === null || value === undefined || value === "") return BigInt(0);
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return BigInt(0);
  // toFixed avoids binary-float artifacts (1.005 * 100 = 100.49999…).
  const fixed = Math.abs(n).toFixed(places + 2);
  const [int, frac = ""] = fixed.split(".");
  const raw = BigInt(int + frac); // places + 2 decimals
  const scaled = divRound(raw, BigInt(100));
  return n < 0 ? -scaled : scaled;
}

export function toCents(value: number | string | null | undefined): bigint {
  return toScaled(value, 2);
}

export function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}

/** Round a dollar amount to the cent. */
export function roundMoney(value: number): number {
  return centsToNumber(toCents(value));
}
