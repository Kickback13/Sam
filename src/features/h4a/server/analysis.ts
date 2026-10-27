import "server-only";

import { parseFieldSources } from "@/lib/field-sources";
import { createClient } from "@/lib/supabase/server";

import { median } from "../underwriting/flags";
import { prefillInputs, type InputSources } from "../underwriting/prefill";
import { parseStoredInputs } from "../underwriting/schema";

export type AnalysisScenario = {
  id: string;
  name: string;
  inputs: ReturnType<typeof parseStoredInputs>;
  sources: InputSources;
  notes: string | null;
  updatedAt: string;
};

export type AnalysisComp = {
  id: string;
  kind: "sale" | "rent";
  address: string;
  city: string | null;
  zip: string | null;
  units: number | null;
  price: number | null;
  price_per_unit: number | null;
  sale_date: string | null;
  cap_rate: number | null;
  unit_type: string | null;
  monthly_rent: number | null;
  distance_miles: number | null;
  source_label: string;
  source_url: string | null;
  as_of: string;
  notes: string | null;
};

/** Everything the analysis page and the PDF need for one property (RLS applies). */
export async function getAnalysisData(workspaceId: string, propertyId: string) {
  const supabase = await createClient();
  const [property, listing, scenarios, comps] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, address, city, state, zip, units, building_sqft, year_built, field_sources, deleted_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("h4a_listings")
      .select("id, price, units, building_sqft, field_sources, verification_status, source_label")
      .eq("workspace_id", workspaceId)
      .eq("property_id", propertyId)
      .order("promoted_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("h4a_underwriting")
      .select("id, name, inputs, input_sources, notes, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("h4a_comps")
      .select(
        "id, kind, address, city, zip, units, price, price_per_unit, sale_date, cap_rate, unit_type, monthly_rent, distance_miles, source_label, source_url, as_of, notes",
      )
      .eq("workspace_id", workspaceId)
      .eq("property_id", propertyId)
      .order("as_of", { ascending: false }),
  ]);
  if (property.error) throw property.error;
  if (!property.data || property.data.deleted_at) return null;

  const p = property.data;
  const l = listing.data;
  const prefill = prefillInputs(
    {
      units: p.units,
      building_sqft: p.building_sqft,
      field_sources: parseFieldSources(p.field_sources),
    },
    l
      ? {
          price: l.price,
          units: l.units,
          building_sqft: l.building_sqft,
          field_sources: parseFieldSources(l.field_sources),
        }
      : null,
  );

  const compRows = (comps.data ?? []) as AnalysisComp[];
  const saleComps = compRows.filter((c) => c.kind === "sale");

  return {
    property: p,
    listing: l
      ? {
          id: l.id,
          verificationStatus: l.verification_status as "unverified" | "verified" | "mismatch",
          sourceLabel: l.source_label,
        }
      : null,
    prefill,
    scenarios: (scenarios.data ?? []).map((s): AnalysisScenario => ({
      id: s.id,
      name: s.name,
      inputs: parseStoredInputs(s.inputs),
      sources: parseFieldSources(s.input_sources) as InputSources,
      notes: s.notes,
      updatedAt: s.updated_at,
    })),
    comps: compRows,
    compStats: {
      saleCount: saleComps.length,
      saleMedianPricePerUnit: median(
        saleComps.map((c) => c.price_per_unit).filter((v): v is number => v !== null),
      ),
      saleMedianCapRate: median(
        saleComps.map((c) => c.cap_rate).filter((v): v is number => v !== null),
      ),
    },
  };
}

export type AnalysisData = NonNullable<Awaited<ReturnType<typeof getAnalysisData>>>;

export type AnalysisListRow = {
  propertyId: string;
  title: string;
  address: string;
  units: number | null;
  scenarioId: string;
  scenarioName: string;
  scenarioCount: number;
  updatedAt: string;
  inputs: ReturnType<typeof parseStoredInputs>;
  flagContext: {
    saleCompMedianPricePerUnit: number | null;
    saleCompCount: number;
    verificationStatus: "unverified" | "verified" | "mismatch" | null;
  };
};

/** Every property with a saved scenario, newest first, with what the flags need (RLS applies). */
export async function listAnalyses(workspaceId: string): Promise<AnalysisListRow[]> {
  const supabase = await createClient();
  const { data: scenarios, error } = await supabase
    .from("h4a_underwriting")
    .select(
      "id, name, inputs, updated_at, property_id, property:properties!h4a_underwriting_workspace_id_property_id_fkey(id, name, address, city, zip, units, deleted_at)",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const latest = new Map<string, { row: NonNullable<typeof scenarios>[number]; count: number }>();
  for (const s of scenarios ?? []) {
    if (!s.property || s.property.deleted_at) continue;
    const hit = latest.get(s.property_id);
    if (hit) hit.count++;
    else latest.set(s.property_id, { row: s, count: 1 });
  }
  const ids = [...latest.keys()];
  if (!ids.length) return [];

  const [comps, listings] = await Promise.all([
    supabase
      .from("h4a_comps")
      .select("property_id, price_per_unit")
      .eq("workspace_id", workspaceId)
      .eq("kind", "sale")
      .in("property_id", ids),
    supabase
      .from("h4a_listings")
      .select("property_id, verification_status, promoted_at")
      .eq("workspace_id", workspaceId)
      .in("property_id", ids)
      .order("promoted_at", { ascending: false, nullsFirst: false }),
  ]);
  const ppuByProperty = new Map<string, number[]>();
  for (const c of comps.data ?? [])
    if (c.price_per_unit !== null)
      ppuByProperty.set(c.property_id, [
        ...(ppuByProperty.get(c.property_id) ?? []),
        c.price_per_unit,
      ]);
  const saleCount = new Map<string, number>();
  for (const c of comps.data ?? [])
    saleCount.set(c.property_id, (saleCount.get(c.property_id) ?? 0) + 1);
  const verification = new Map<string, string>();
  for (const l of listings.data ?? [])
    if (l.property_id && !verification.has(l.property_id))
      verification.set(l.property_id, l.verification_status);

  return ids.map((id) => {
    const { row, count } = latest.get(id)!;
    const p = row.property!;
    return {
      propertyId: id,
      title: p.name ?? p.address,
      address: [p.address, p.city, p.zip].filter(Boolean).join(", "),
      units: p.units,
      scenarioId: row.id,
      scenarioName: row.name,
      scenarioCount: count,
      updatedAt: row.updated_at,
      inputs: parseStoredInputs(row.inputs),
      flagContext: {
        saleCompMedianPricePerUnit: median(ppuByProperty.get(id) ?? []),
        saleCompCount: saleCount.get(id) ?? 0,
        verificationStatus:
          (verification.get(id) as "unverified" | "verified" | "mismatch" | undefined) ?? null,
      },
    };
  });
}
