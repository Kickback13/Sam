import "server-only";

import { createClient } from "@/lib/supabase/server";

import { escapeLike } from "./contacts";

export const PROPERTIES_PAGE_SIZE = 50;

export type PropertyFilters = {
  q?: string;
  type?: string;
  minUnits?: number;
  page?: number;
  sort?: "updated" | "units" | "address";
};

export async function listProperties(workspaceId: string, f: PropertyFilters) {
  const supabase = await createClient();
  let q = supabase
    .from("properties")
    .select(
      "id, name, address, city, zip, property_type, units, year_built, last_sale_price, assessed_value, submarket, updated_at, field_sources, owner:contacts!properties_workspace_id_owner_contact_id_fkey(id, full_name), owner_company:companies!properties_workspace_id_owner_company_id_fkey(id, name)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const term = f.q?.trim().toLowerCase();
  if (term) q = q.like("search_text", `%${escapeLike(term)}%`);
  if (f.type) q = q.eq("property_type", f.type);
  if (f.minUnits) q = q.gte("units", f.minUnits);
  if (f.sort === "units") q = q.order("units", { ascending: false, nullsFirst: false });
  else if (f.sort === "address") q = q.order("address");
  else q = q.order("updated_at", { ascending: false });
  const page = Math.max(1, f.page ?? 1);
  const from = (page - 1) * PROPERTIES_PAGE_SIZE;
  const { data, error, count } = await q.order("id").range(from, from + PROPERTIES_PAGE_SIZE - 1);
  if (error) throw error;
  return { total: count ?? 0, rows: data ?? [] };
}

export async function getProperty(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      "*, owner:contacts!properties_workspace_id_owner_contact_id_fkey(id, full_name, emails, phones), owner_company:companies!properties_workspace_id_owner_company_id_fkey(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPropertyDeals(workspaceId: string, propertyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deals")
    .select(
      "id, title, value, status, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey(name, color)",
    )
    .eq("workspace_id", workspaceId)
    .eq("property_id", propertyId)
    .is("deleted_at", null);
  return data ?? [];
}
