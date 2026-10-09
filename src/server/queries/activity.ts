import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SubjectType } from "@/lib/validation/activity";

import { resolveSubjects } from "./subjects";

export type ActivityItem = {
  id: string;
  type: "note" | "call" | "email" | "sms" | "meeting" | "stage_change" | "system";
  body: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  actorName: string;
  subject: { type: SubjectType; id: string; name: string; path: string } | null;
};

const SELECT =
  "id, type, body, occurred_at, metadata, created_by, subject_type, subject_id, actor:profiles!activities_created_by_fkey(full_name, email)";

type Row = {
  id: string;
  type: ActivityItem["type"];
  body: string | null;
  occurred_at: string;
  metadata: unknown;
  created_by: string | null;
  subject_type: SubjectType;
  subject_id: string;
  actor: { full_name: string | null; email: string | null } | null;
};

async function hydrate(rows: Row[], withSubjects: boolean): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const subjects = withSubjects
    ? await resolveSubjects(
        supabase,
        rows.map((r) => ({ type: r.subject_type, id: r.subject_id })),
      )
    : new Map();
  return rows.map((r) => {
    const s = subjects.get(`${r.subject_type}:${r.subject_id}`);
    return {
      id: r.id,
      type: r.type,
      body: r.body,
      occurredAt: r.occurred_at,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdBy: r.created_by,
      actorName: r.actor?.full_name?.trim() || r.actor?.email?.split("@")[0] || (r.created_by ? "Teammate" : "System"),
      subject: s ? { type: r.subject_type, id: r.subject_id, ...s } : null,
    };
  });
}

export async function getRecentActivity(workspaceId: string, limit = 15): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrate((data ?? []) as unknown as Row[], true);
}

export async function getSubjectActivity(
  workspaceId: string,
  subjects: { type: SubjectType; id: string }[],
  limit = 100,
): Promise<ActivityItem[]> {
  if (subjects.length === 0) return [];
  const supabase = await createClient();
  const filter = subjects.map((s) => `and(subject_type.eq.${s.type},subject_id.eq.${s.id})`).join(",");
  const { data, error } = await supabase
    .from("activities")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .or(filter)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrate((data ?? []) as unknown as Row[], subjects.length > 1);
}
