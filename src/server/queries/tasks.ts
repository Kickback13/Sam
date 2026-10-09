import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SubjectType } from "@/lib/validation/activity";

import { resolveSubjects } from "./subjects";

export type TaskItem = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: "open" | "done" | "canceled";
  completedAt: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  related: { type: SubjectType; id: string; name: string; path: string } | null;
};

type Filter = {
  assignedTo?: string | "unassigned";
  status?: "open" | "done" | "all";
  dueBefore?: string;
  related?: { type: SubjectType; id: string }[];
  limit?: number;
};

export async function getTasks(workspaceId: string, filter: Filter = {}): Promise<TaskItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select(
      "id, title, notes, due_at, status, completed_at, assigned_to, related_type, related_id, assignee:profiles!tasks_assigned_to_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId);

  if (filter.assignedTo === "unassigned") q = q.is("assigned_to", null);
  else if (filter.assignedTo) q = q.eq("assigned_to", filter.assignedTo);
  if (filter.status === "open" || filter.status === undefined) q = q.eq("status", "open");
  else if (filter.status === "done") q = q.eq("status", "done");
  if (filter.dueBefore) q = q.lte("due_at", filter.dueBefore);
  if (filter.related?.length) {
    q = q.or(
      filter.related.map((r) => `and(related_type.eq.${r.type},related_id.eq.${r.id})`).join(","),
    );
  }

  q =
    filter.status === "done"
      ? q.order("completed_at", { ascending: false })
      : q
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

  const { data, error } = await q.limit(filter.limit ?? 200);
  if (error) throw error;

  const rows = data ?? [];
  const subjects = await resolveSubjects(
    supabase,
    rows
      .filter((r) => r.related_type && r.related_id)
      .map((r) => ({ type: r.related_type!, id: r.related_id! })),
  );

  return rows.map((r) => {
    const s =
      r.related_type && r.related_id
        ? subjects.get(`${r.related_type}:${r.related_id}`)
        : undefined;
    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      dueAt: r.due_at,
      status: r.status,
      completedAt: r.completed_at,
      assignedTo: r.assigned_to,
      assigneeName: r.assignee?.full_name?.trim() || r.assignee?.email?.split("@")[0] || null,
      related:
        s && r.related_type && r.related_id
          ? { type: r.related_type, id: r.related_id, ...s }
          : null,
    };
  });
}
