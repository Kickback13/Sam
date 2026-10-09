import "server-only";

import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import type { EmailEntry, PhoneEntry } from "@/lib/validation/contact";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

export type ContactListItem = {
  id: string;
  name: string;
  title: string | null;
  company: { id: string; name: string } | null;
  roles: string[];
  email: string | null;
  phone: string | null;
  city: string | null;
  tags: string[];
  source: string | null;
  assignee: string | null;
  dnc: boolean;
  smsConsent: ContactRow["sms_consent"];
  emailOptOut: boolean;
  updatedAt: string;
};

export type ContactFilters = {
  q?: string;
  role?: string;
  tag?: string;
  source?: string;
  assigned?: string; // user id | "unassigned"
  sort?: "name" | "created" | "updated";
  dir?: "asc" | "desc";
  page?: number;
};

export const CONTACTS_PAGE_SIZE = 50;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function primary<T extends { value: string; is_primary?: boolean }>(list: unknown): T | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const items = list as T[];
  return items.find((e) => e.is_primary) ?? items[0];
}

export function contactDisplayName(c: Pick<ContactRow, "full_name" | "emails" | "phones">): string {
  return (
    c.full_name ??
    primary<EmailEntry>(c.emails)?.value ??
    primary<PhoneEntry>(c.phones)?.value ??
    "Unnamed contact"
  );
}

export async function listContacts(
  workspaceId: string,
  f: ContactFilters,
): Promise<{ rows: ContactListItem[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("contacts")
    .select(
      "id, full_name, first_name, last_name, title, roles, emails, phones, city, tags, source, assigned_to, dnc, sms_consent, email_opt_out, updated_at, created_at, company:companies!contacts_workspace_id_company_id_fkey(id, name), assignee:profiles!contacts_assigned_to_fkey(full_name, email)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const term = f.q?.trim().toLowerCase();
  if (term) q = q.like("search_text", `%${escapeLike(term)}%`);
  if (f.role) q = q.contains("roles", [f.role]);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.source) q = q.eq("source", f.source);
  if (f.assigned === "unassigned") q = q.is("assigned_to", null);
  else if (f.assigned) q = q.eq("assigned_to", f.assigned);

  const asc = (f.dir ?? (f.sort === "name" || !f.sort ? "asc" : "desc")) === "asc";
  if (f.sort === "created") q = q.order("created_at", { ascending: asc });
  else if (f.sort === "updated") q = q.order("updated_at", { ascending: asc });
  else
    q = q
      .order("last_name", { ascending: asc, nullsFirst: false })
      .order("first_name", { ascending: asc, nullsFirst: false });
  q = q.order("id");

  const page = Math.max(1, f.page ?? 1);
  const from = (page - 1) * CONTACTS_PAGE_SIZE;
  const { data, error, count } = await q.range(from, from + CONTACTS_PAGE_SIZE - 1);
  if (error) throw error;

  return {
    total: count ?? 0,
    rows: (data ?? []).map((c) => ({
      id: c.id,
      name: contactDisplayName(c),
      title: c.title,
      company: c.company ? { id: c.company.id, name: c.company.name } : null,
      roles: c.roles,
      email: primary<EmailEntry>(c.emails)?.value ?? null,
      phone: primary<PhoneEntry>(c.phones)?.value ?? null,
      city: c.city,
      tags: c.tags,
      source: c.source,
      assignee: c.assignee?.full_name?.trim() || c.assignee?.email?.split("@")[0] || null,
      dnc: c.dnc,
      smsConsent: c.sms_consent,
      emailOptOut: c.email_opt_out,
      updatedAt: c.updated_at,
    })),
  };
}

export type Facet = { value: string; count: number };

export async function getContactFacets(
  workspaceId: string,
): Promise<{ tags: Facet[]; sources: Facet[] }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("contact_facets", { p_workspace_id: workspaceId });
  const facets = (data ?? {}) as { tags?: Facet[]; sources?: Facet[] };
  return { tags: facets.tags ?? [], sources: facets.sources ?? [] };
}

export async function getContact(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "*, company:companies!contacts_workspace_id_company_id_fkey(id, name), assignee:profiles!contacts_assigned_to_fkey(id, full_name, email), creator:profiles!contacts_created_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContact>>>;

export async function getContactLinks(workspaceId: string, contactId: string) {
  const supabase = await createClient();
  const [primaryDeals, roleDeals, properties] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, title, value, status, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey(name, color)",
      )
      .eq("workspace_id", workspaceId)
      .eq("primary_contact_id", contactId)
      .is("deleted_at", null),
    supabase
      .from("deal_contacts")
      .select(
        "role, deal:deals!deal_contacts_workspace_id_deal_id_fkey(id, title, value, status, deleted_at, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey(name, color))",
      )
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId),
    supabase
      .from("properties")
      .select("id, name, address, city, units, property_type")
      .eq("workspace_id", workspaceId)
      .eq("owner_contact_id", contactId)
      .is("deleted_at", null),
  ]);

  type DealLink = {
    id: string;
    title: string;
    value: number | null;
    status: string;
    stage: { name: string; color: string } | null;
    role: string | null;
  };
  const deals = new Map<string, DealLink>();
  for (const d of primaryDeals.data ?? [])
    deals.set(d.id, { ...d, stage: d.stage, role: "Primary contact" });
  for (const dc of roleDeals.data ?? []) {
    const d = dc.deal;
    if (!d || d.deleted_at || deals.has(d.id)) continue;
    deals.set(d.id, {
      id: d.id,
      title: d.title,
      value: d.value,
      status: d.status,
      stage: d.stage,
      role: dc.role,
    });
  }
  return { deals: [...deals.values()], properties: properties.data ?? [] };
}
