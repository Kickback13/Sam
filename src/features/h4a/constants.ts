/** Deal Finder (Housing4All Track) labels and enums. */

export const LISTING_STATUSES = [
  { value: "new", label: "New" },
  { value: "needs_review", label: "Needs review" },
  { value: "dismissed", label: "Dismissed" },
  { value: "promoted", label: "Promoted" },
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number]["value"];

export const LISTING_ORIGINS = [
  { value: "email", label: "Forwarded email" },
  { value: "paste", label: "Pasted email" },
  { value: "csv", label: "CSV upload" },
  { value: "manual", label: "Manual entry" },
  { value: "county", label: "County record" },
  { value: "demo", label: "Demo data" },
] as const;
export type ListingOrigin = (typeof LISTING_ORIGINS)[number]["value"];

export const VERIFICATION_STATUSES = [
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "mismatch", label: "Mismatch" },
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]["value"];

export const SCORE_BANDS = [
  { value: "high", label: "High (70–100)", min: 70, max: 100 },
  { value: "medium", label: "Medium (40–69)", min: 40, max: 69 },
  { value: "low", label: "Low (0–39)", min: 0, max: 39 },
  { value: "unscored", label: "Not scored", min: null, max: null },
] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number]["value"];

export const DEFAULT_ALERT_THRESHOLD = 70;

export const DISMISS_REASONS = [
  "Outside the buy box",
  "Price too high",
  "Already seen / duplicate",
  "Not a fit (condition, location, tenancy)",
  "Sold or off the market",
] as const;

/** Where to verify by hand while the county data feed is Not connected (ADR-024). */
export const VERIFICATION_SOURCES = [
  "San Diego County Assessor (Parcel lookup)",
  "San Diego County Recorder (Grantor/Grantee index)",
  "SanGIS parcel map",
  "Title company report",
  "Broker-provided documents",
] as const;

export function labelOf<T extends readonly { value: string; label: string }[]>(
  list: T,
  value: string | null | undefined,
): string {
  if (!value) return "";
  return list.find((x) => x.value === value)?.label ?? value;
}
