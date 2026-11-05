import "server-only";

import { parseFieldSources } from "@/lib/field-sources";
import { createClient } from "@/lib/supabase/server";

import {
  fromRecordedSale,
  fromRentCastPull,
  fromSavedComp,
  rankCompSuggestions,
  type CompCandidate,
  type CompSuggestion,
  type SavedCompRow,
} from "../comps/suggest";

export type CompSuggestions = {
  sale: CompSuggestion[];
  rent: CompSuggestion[];
  /** What was looked at, so an empty list can say why. */
  scanned: { recordedSales: number; savedComps: number; rentcastComparables: number };
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Comp suggestions for a property from data the workspace already holds (ADR-042).
 * Runs under the user's session (RLS) and makes no outside request.
 */
export async function getCompSuggestions(
  workspaceId: string,
  propertyId: string,
  supabase?: Supabase,
): Promise<CompSuggestions | null> {
  const db = supabase ?? (await createClient());
  const { data: subject, error } = await db
    .from("properties")
    .select("id, address, city, zip, lat, lng, units, property_type, deleted_at")
    .eq("workspace_id", workspaceId)
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!subject || subject.deleted_at) return null;

  const [sales, saved, existing, pulls] = await Promise.all([
    db
      .from("properties")
      .select(
        "id, name, address, city, zip, lat, lng, units, building_sqft, year_built, property_type, last_sale_price, last_sale_date, field_sources",
      )
      .eq("workspace_id", workspaceId)
      .neq("id", propertyId)
      .is("deleted_at", null)
      .not("last_sale_price", "is", null)
      .not("last_sale_date", "is", null)
      .order("last_sale_date", { ascending: false })
      .limit(2000),
    db
      .from("h4a_comps")
      .select(
        "id, property_id, kind, address, city, zip, units, building_sqft, year_built, price, sale_date, cap_rate, unit_type, monthly_rent, source_label, source_url, as_of, notes",
      )
      .eq("workspace_id", workspaceId)
      .neq("property_id", propertyId)
      .order("as_of", { ascending: false })
      .limit(2000),
    db
      .from("h4a_comps")
      .select("kind, address")
      .eq("workspace_id", workspaceId)
      .eq("property_id", propertyId),
    db
      .from("property_data_pulls")
      .select("id, kind, payload, fetched_at")
      .eq("workspace_id", workspaceId)
      .eq("property_id", propertyId)
      .eq("status", "found")
      .in("kind", ["value", "rent"])
      .order("fetched_at", { ascending: false })
      .limit(10),
  ]);
  for (const r of [sales, saved, existing, pulls]) if (r.error) throw r.error;

  const candidates: CompCandidate[] = [];
  let recordedSales = 0;
  for (const p of sales.data ?? []) {
    const c = fromRecordedSale({ ...p, field_sources: parseFieldSources(p.field_sources) });
    if (c) {
      candidates.push(c);
      recordedSales++;
    }
  }
  for (const c of (saved.data ?? []) as SavedCompRow[]) candidates.push(fromSavedComp(c));

  // Only the latest answer of each kind, the same one the RentCast panel shows.
  let rentcastComparables = 0;
  const seen = new Set<string>();
  for (const pull of pulls.data ?? []) {
    if (seen.has(pull.kind)) continue;
    seen.add(pull.kind);
    const payload = (pull.payload ?? {}) as { comparables?: unknown };
    const list = fromRentCastPull({
      id: pull.id,
      kind: pull.kind as "value" | "rent",
      fetched_at: pull.fetched_at,
      comparables: payload.comparables,
    });
    rentcastComparables += list.length;
    candidates.push(...list);
  }

  const ranked = rankCompSuggestions(
    {
      id: subject.id,
      address: subject.address,
      city: subject.city,
      zip: subject.zip,
      lat: subject.lat === null ? null : Number(subject.lat),
      lng: subject.lng === null ? null : Number(subject.lng),
      units: subject.units,
      property_type: subject.property_type,
    },
    candidates,
    (existing.data ?? []) as { kind: "sale" | "rent"; address: string }[],
  );
  return {
    ...ranked,
    scanned: {
      recordedSales,
      savedComps: saved.data?.length ?? 0,
      rentcastComparables,
    },
  };
}
