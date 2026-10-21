/**
 * Deal Finder dedupe rule (pure). The database applies the same rule inside
 * app_private.h4a_ingest_one; this copy plans CSV previews and is unit-tested.
 *
 *   same listing  ⇔  APNs equal
 *                 or (match keys overlap and the APNs don't conflict)
 */

export type Keyed = { apnKey: string | null; matchKeys: string[] };

export function isSameListing(a: Keyed, b: Keyed): boolean {
  if (a.apnKey && b.apnKey) {
    if (a.apnKey === b.apnKey) return true;
    return false;
  }
  const keys = new Set(a.matchKeys);
  return b.matchKeys.some((k) => keys.has(k));
}

export type ExistingListing = Keyed & { id: string; address: string };

export type RowPlan =
  | { action: "create" }
  | { action: "update"; existingId: string; existingAddress: string }
  | { action: "duplicate_in_file"; firstRow: number };

/** Plan each row in order: update an existing listing, repeat an earlier row, or create. */
export function planListingRows(
  rows: (Keyed & { row: number })[],
  existing: ExistingListing[],
): Map<number, RowPlan> {
  const plans = new Map<number, RowPlan>();
  const seen: (Keyed & { row: number })[] = [];
  for (const row of rows) {
    const byApn = row.apnKey ? existing.find((e) => e.apnKey === row.apnKey) : undefined;
    const match = byApn ?? existing.find((e) => isSameListing(row, e));
    if (match) {
      plans.set(row.row, {
        action: "update",
        existingId: match.id,
        existingAddress: match.address,
      });
    } else {
      const earlier = seen.find((s) => isSameListing(row, s));
      plans.set(
        row.row,
        earlier ? { action: "duplicate_in_file", firstRow: earlier.row } : { action: "create" },
      );
    }
    seen.push(row);
  }
  return plans;
}
