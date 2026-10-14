import "server-only";

import { endOfTodayIso, todayInAppTz } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { addDays, weekStart, zonedDateTime } from "../schedule/time";

export type AzhToday = {
  newRequests: { count: number; latest: { id: string; label: string; submittedAt: string }[] };
  awaitingEstimates: {
    count: number;
    total: number;
    latest: { id: string; dealId: string; label: string; sentOn: string | null }[];
  };
  inProgress: { count: number; latest: { id: string; title: string }[] };
  visitsThisWeek: {
    count: number;
    next: { id: string; startsAt: string; label: string; office: string }[];
  };
  tasksDue: number;
};

/** Real-data counts for the construction Today page (RLS-scoped). */
export async function getAzhToday(workspaceId: string, now = new Date()): Promise<AzhToday> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const monday = weekStart(todayInAppTz(now));
  const weekFrom = zonedDateTime(monday, "00:00").toISOString();
  const weekTo = zonedDateTime(addDays(monday, 7), "00:00").toISOString();

  const [requests, estimates, progress, visits, tasks] = await Promise.all([
    supabase
      .from("azh_requests")
      .select(
        "id, service_type, submitted_at, contact:contacts!azh_requests_workspace_id_contact_id_fkey(full_name)",
        {
          count: "exact",
        },
      )
      .eq("workspace_id", workspaceId)
      .gte("submitted_at", sevenDaysAgo)
      .order("submitted_at", { ascending: false })
      .limit(3),
    supabase
      .from("azh_estimates")
      .select(
        "id, deal_id, total, sent_on, version, deal:deals!azh_estimates_workspace_id_deal_id_fkey(title, deleted_at)",
        {
          count: "exact",
        },
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "sent")
      .order("sent_on", { ascending: true })
      .limit(50),
    supabase
      .from("deals")
      .select("id, title, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey!inner(name)", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("stage.name", "In Progress")
      .order("stage_entered_at", { ascending: false })
      .limit(3),
    supabase
      .from("azh_visits")
      .select(
        "id, starts_at, office, address, deal:deals!azh_visits_workspace_id_deal_id_fkey(title)",
        { count: "exact" },
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .gte("starts_at", weekFrom)
      .lt("starts_at", weekTo)
      .order("starts_at")
      .limit(3),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .lte("due_at", endOfTodayIso(now)),
  ]);
  for (const r of [requests, estimates, progress, visits, tasks]) if (r.error) throw r.error;

  const liveEstimates = (estimates.data ?? []).filter((e) => !e.deal?.deleted_at);
  return {
    newRequests: {
      count: requests.count ?? 0,
      latest: (requests.data ?? []).map((r) => ({
        id: r.id,
        label: [r.contact?.full_name, r.service_type].filter(Boolean).join(" — ") || "Request",
        submittedAt: r.submitted_at,
      })),
    },
    awaitingEstimates: {
      count: liveEstimates.length,
      total: liveEstimates.reduce((s, e) => s + Number(e.total), 0),
      latest: liveEstimates.slice(0, 3).map((e) => ({
        id: e.id,
        dealId: e.deal_id,
        label: `${e.deal?.title ?? "Project"} (v${e.version})`,
        sentOn: e.sent_on,
      })),
    },
    inProgress: {
      count: progress.count ?? 0,
      latest: (progress.data ?? []).map((d) => ({ id: d.id, title: d.title })),
    },
    visitsThisWeek: {
      count: visits.count ?? 0,
      next: (visits.data ?? []).map((v) => ({
        id: v.id,
        startsAt: v.starts_at,
        office: v.office,
        label: v.deal?.title ?? v.address ?? "Estimate visit",
      })),
    },
    tasksDue: tasks.count ?? 0,
  };
}
