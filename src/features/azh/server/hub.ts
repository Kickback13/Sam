import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSubjectActivity, type ActivityItem } from "@/server/queries/activity";

import {
  estimateEvents,
  mergeHub,
  projectEvents,
  requestEvents,
  visitEvent,
  type HubEntry,
  type HubEvent,
} from "../hub/timeline";

const personName = (p: { full_name: string | null; email: string | null } | null | undefined) =>
  p ? p.full_name?.trim() || p.email?.split("@")[0] || "Member" : null;

/**
 * Everything AZH has on one contact, newest first: calls and notes on the contact and on
 * their projects, their homeowner requests, estimate visits, estimates and projects.
 * Reads under the user's session, so RLS decides what is visible.
 */
export async function getContactHub(
  workspaceId: string,
  contactId: string,
  linkedDealIds: string[],
): Promise<HubEntry<ActivityItem>[]> {
  const supabase = await createClient();

  const { data: requests, error: reqErr } = await supabase
    .from("azh_requests")
    .select(
      "id, deal_id, status, office, service_type, description, job_address, source, submitted_at, contacted_at, converted_at, closed_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (reqErr) throw reqErr;

  const requestIds = (requests ?? []).map((r) => r.id);
  const candidateDeals = [
    ...new Set([...linkedDealIds, ...(requests ?? []).map((r) => r.deal_id).filter(Boolean)]),
  ] as string[];

  // Only live (not deleted) deals count as this contact's projects.
  const { data: deals, error: dealErr } = candidateDeals.length
    ? await supabase
        .from("deals")
        .select("id, title")
        .eq("workspace_id", workspaceId)
        .in("id", candidateDeals)
        .is("deleted_at", null)
    : { data: [] as { id: string; title: string }[], error: null };
  if (dealErr) throw dealErr;
  const dealIds = (deals ?? []).map((d) => d.id);
  const dealTitle = new Map((deals ?? []).map((d) => [d.id, d.title]));

  const visitFilter = [
    dealIds.length ? `deal_id.in.(${dealIds.join(",")})` : null,
    requestIds.length ? `request_id.in.(${requestIds.join(",")})` : null,
  ].filter(Boolean) as string[];

  const [visits, estimates, projects, activities] = await Promise.all([
    visitFilter.length
      ? supabase
          .from("azh_visits")
          .select(
            "id, status, starts_at, office, address, notes, estimator:profiles!azh_visits_estimator_id_fkey(full_name, email)",
          )
          .eq("workspace_id", workspaceId)
          .or(visitFilter.join(","))
          .order("starts_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? supabase
          .from("azh_estimates")
          .select(
            "id, deal_id, version, title, status, total, created_at, sent_on, accepted_on, declined_on",
          )
          .eq("workspace_id", workspaceId)
          .in("deal_id", dealIds)
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? supabase
          .from("azh_projects")
          .select("deal_id, created_at, start_on, completed_on, job_address")
          .eq("workspace_id", workspaceId)
          .in("deal_id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    getSubjectActivity(workspaceId, [
      { type: "contact", id: contactId },
      ...dealIds.map((id) => ({ type: "deal" as const, id })),
    ]),
  ]);
  for (const r of [visits, estimates, projects]) if (r.error) throw r.error;

  const events: HubEvent[] = [
    ...(requests ?? []).flatMap(requestEvents),
    ...(visits.data ?? []).map((v) =>
      visitEvent({
        id: v.id,
        status: v.status,
        starts_at: v.starts_at,
        office: v.office,
        address: v.address,
        notes: v.notes,
        estimatorName: personName(v.estimator),
      }),
    ),
    ...(estimates.data ?? []).flatMap((e) =>
      estimateEvents({
        ...e,
        total: Number(e.total),
        dealTitle: dealTitle.get(e.deal_id) ?? "Project",
      }),
    ),
    ...(projects.data ?? []).flatMap((p) =>
      projectEvents({ ...p, dealTitle: dealTitle.get(p.deal_id) ?? "Project" }),
    ),
  ];

  return mergeHub(activities, events);
}
