import "server-only";

import { createClient } from "@/lib/supabase/server";

import { escapeLike } from "./contacts";

export const COMPANIES_PAGE_SIZE = 50;

export async function listCompanies(
  workspaceId: string,
  f: { q?: string; type?: string; page?: number },
) {
  const supabase = await createClient();
  let q = supabase
    .from("companies")
    .select(
      "id, name, type, website, phone, city, tags, updated_at, contacts:contacts!contacts_workspace_id_company_id_fkey(count)",
      {
        count: "exact",
      },
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const term = f.q?.trim().toLowerCase();
  if (term) q = q.like("search_text", `%${escapeLike(term)}%`);
  if (f.type) q = q.eq("type", f.type);
  const page = Math.max(1, f.page ?? 1);
  const from = (page - 1) * COMPANIES_PAGE_SIZE;
  const { data, error, count } = await q.order("name").range(from, from + COMPANIES_PAGE_SIZE - 1);
  if (error) throw error;
  return {
    total: count ?? 0,
    rows: (data ?? []).map((c) => ({
      ...c,
      contactCount: (c.contacts as unknown as { count: number }[])?.[0]?.count ?? 0,
    })),
  };
}

export async function getCompany(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCompanyLinks(workspaceId: string, companyId: string) {
  const supabase = await createClient();
  const [contacts, properties] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, title, emails, phones, roles")
      .eq("workspace_id", workspaceId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("last_name")
      .limit(200),
    supabase
      .from("properties")
      .select("id, name, address, city, units")
      .eq("workspace_id", workspaceId)
      .eq("owner_company_id", companyId)
      .is("deleted_at", null)
      .limit(200),
  ]);
  return { contacts: contacts.data ?? [], properties: properties.data ?? [] };
}
