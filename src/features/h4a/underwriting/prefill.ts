/**
 * Starting inputs for a new scenario, and where each one came from (pure).
 *
 * Only facts we actually have are copied in: price from the promoted listing
 * (the asking price — never the last sale price), units and sq ft from the
 * property (falling back to the listing). Each keeps its original source and
 * date. Everything else starts blank: rents, vacancy, expenses and the loan are
 * Sam's assumptions to enter.
 */
import type { FieldSource, FieldSources } from "@/lib/field-sources";

import { EMPTY_INPUTS, type InputKey, type UnderwritingInputs } from "./math";

type Sourced = { field_sources: FieldSources };
export type PrefillProperty = Sourced & { units: number | null; building_sqft: number | null };
export type PrefillListing = Sourced & {
  price: number | null;
  units: number | null;
  building_sqft: number | null;
};

export type InputSources = Partial<Record<InputKey, FieldSource>>;

export function prefillInputs(
  property: PrefillProperty,
  listing: PrefillListing | null,
): { inputs: UnderwritingInputs; sources: InputSources } {
  const inputs: UnderwritingInputs = { ...EMPTY_INPUTS, unitMix: [] };
  const sources: InputSources = {};

  const take = (
    key: "price" | "units" | "buildingSqft",
    candidates: { value: number | null; source: FieldSource | undefined }[],
  ) => {
    const hit = candidates.find((c) => c.value !== null && c.value > 0);
    if (!hit) return;
    inputs[key] = hit.value;
    if (hit.source) sources[key] = hit.source;
  };

  take("price", [{ value: listing?.price ?? null, source: listing?.field_sources.price }]);
  take("units", [
    { value: property.units, source: property.field_sources.units },
    { value: listing?.units ?? null, source: listing?.field_sources.units },
  ]);
  take("buildingSqft", [
    { value: property.building_sqft, source: property.field_sources.building_sqft },
    { value: listing?.building_sqft ?? null, source: listing?.field_sources.building_sqft },
  ]);

  return { inputs, sources };
}

/** Comparable form of an input value, for spotting edits. */
function comparable(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
  return String(v);
}

/**
 * Sources after an edit: changed inputs become "Entered by {user}", unchanged
 * ones keep theirs, cleared ones lose theirs.
 */
export function stampInputSources(
  existing: InputSources,
  before: UnderwritingInputs,
  after: UnderwritingInputs,
  user: { id: string; name: string },
  now: Date = new Date(),
): InputSources {
  const next: InputSources = {};
  for (const key of Object.keys(after) as InputKey[]) {
    if (key === "expenseMode") continue;
    const prev = comparable(before[key]);
    const curr = comparable(after[key]);
    if (curr === null) continue;
    if (prev === curr && existing[key]) {
      next[key] = existing[key];
    } else {
      next[key] = {
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
