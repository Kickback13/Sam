import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { SubjectType } from "@/lib/validation/activity";

export type SubjectRef = { type: SubjectType; id: string };
export type ResolvedSubject = { name: string; path: string };

const PATHS: Record<SubjectType, (id: string) => string> = {
  contact: (id) => `people/${id}`,
  company: (id) => `companies/${id}`,
  property: (id) => `properties/${id}`,
  deal: (id) => `pipeline?deal=${id}`,
};

/** Look up display names for polymorphic subjects (activities, tasks) in one round trip per type. */
export async function resolveSubjects(
  supabase: ServerSupabase,
  refs: SubjectRef[],
): Promise<Map<string, ResolvedSubject>> {
  const out = new Map<string, ResolvedSubject>();
  const ids = (type: SubjectType) => [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];

  const [contacts, companies, properties, deals] = await Promise.all([
    ids("contact").length
      ? supabase.from("contacts").select("id, full_name, emails").in("id", ids("contact"))
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; emails: unknown }[] }),
    ids("company").length
      ? supabase.from("companies").select("id, name").in("id", ids("company"))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids("property").length
      ? supabase.from("properties").select("id, name, address").in("id", ids("property"))
      : Promise.resolve({ data: [] as { id: string; name: string | null; address: string }[] }),
    ids("deal").length
      ? supabase.from("deals").select("id, title").in("id", ids("deal"))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  for (const c of contacts.data ?? []) {
    const email = Array.isArray(c.emails) ? (c.emails[0] as { value?: string } | undefined)?.value : undefined;
    out.set(`contact:${c.id}`, { name: c.full_name ?? email ?? "Unnamed contact", path: PATHS.contact(c.id) });
  }
  for (const c of companies.data ?? []) out.set(`company:${c.id}`, { name: c.name, path: PATHS.company(c.id) });
  for (const p of properties.data ?? [])
    out.set(`property:${p.id}`, { name: p.name ?? p.address, path: PATHS.property(p.id) });
  for (const d of deals.data ?? []) out.set(`deal:${d.id}`, { name: d.title, path: PATHS.deal(d.id) });
  return out;
}
