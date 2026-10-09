/**
 * The trust layer: every property value records where it came from and when.
 * Shape stored in properties.field_sources[field].
 */
export type FieldSource = {
  source: string; // "manual" | "demo" | "county" | "data_api" | "csv" | ...
  label: string; // human label, e.g. "Entered by Sam Rodriguez"
  url?: string | null;
  fetched_at: string; // ISO timestamp
  user_id?: string | null;
};

export type FieldSources = Record<string, FieldSource>;

export function parseFieldSources(value: unknown): FieldSources {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: FieldSources = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.source !== "string" || typeof r.fetched_at !== "string") continue;
    out[key] = {
      source: r.source,
      label: typeof r.label === "string" ? r.label : r.source,
      url: typeof r.url === "string" ? r.url : null,
      fetched_at: r.fetched_at,
      user_id: typeof r.user_id === "string" ? r.user_id : null,
    };
  }
  return out;
}

/**
 * Stamp "Entered by {user}" on every field whose value changed. Unchanged fields
 * keep their existing source; cleared fields drop theirs.
 */
export function stampManualSources(
  existing: FieldSources,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
  user: { id: string; name: string },
  now: Date = new Date(),
): FieldSources {
  const next: FieldSources = { ...existing };
  for (const field of fields) {
    const prev = normalizeForCompare(before[field]);
    const curr = normalizeForCompare(after[field]);
    if (curr === null) {
      delete next[field];
    } else if (prev !== curr || !next[field]) {
      next[field] = {
        source: "manual",
        label: `Entered by ${user.name}`,
        url: null,
        fetched_at: now.toISOString(),
        user_id: user.id,
      };
    }
  }
  return next;
}

function normalizeForCompare(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

/** Fields on a property that carry provenance. */
export const SOURCED_PROPERTY_FIELDS = [
  "property_type",
  "units",
  "buildings",
  "building_sqft",
  "lot_sqft",
  "year_built",
  "zoning",
  "apn",
  "last_sale_date",
  "last_sale_price",
  "assessed_value",
  "lat",
  "lng",
] as const;
