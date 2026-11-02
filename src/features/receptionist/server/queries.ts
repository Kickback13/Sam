import "server-only";

import { createClient } from "@/lib/supabase/server";

import { parseHours, type Hours, type Route } from "../routing";

export type ReceptionistSettings = {
  enabled: boolean;
  ringSeconds: number;
  timeZone: string;
  hours: Hours;
  greetingEn: string | null;
  greetingEs: string | null;
};

export async function getSettings(workspaceId: string): Promise<ReceptionistSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionist_settings")
    .select("enabled, ring_seconds, time_zone, hours, greeting_en, greeting_es")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.enabled ?? false,
    ringSeconds: data?.ring_seconds ?? 15,
    timeZone: data?.time_zone ?? "America/Los_Angeles",
    hours: parseHours(data?.hours),
    greetingEn: data?.greeting_en ?? null,
    greetingEs: data?.greeting_es ?? null,
  };
}

export type RouteRow = Route & {
  description: string | null;
  assigneeUserId: string | null;
  active: boolean;
  position: number;
};

export async function listRoutes(workspaceId: string): Promise<RouteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionist_routes")
    .select(
      "id, name, description, forward_to, keywords, languages, assignee_user_id, is_default, active, position",
    )
    .eq("workspace_id", workspaceId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    forward_to: r.forward_to,
    keywords: r.keywords,
    languages: r.languages,
    is_default: r.is_default,
    assigneeUserId: r.assignee_user_id,
    active: r.active,
    position: r.position,
  }));
}

export async function hasActiveToken(workspaceId: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("receptionist_tokens")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null);
  if (error) return null; // non-admins can't see tokens
  return (count ?? 0) > 0;
}

export type CallRow = {
  id: string;
  fromNumber: string | null;
  startedAt: string;
  durationSecs: number | null;
  language: string | null;
  outcome: "in_progress" | "answered" | "answered_by_ai" | "voicemail" | "missed";
  routeName: string | null;
  callerName: string | null;
  contactId: string | null;
  contactName: string | null;
  summary: string | null;
  summarySource: string | null;
  transcript: { role: string; text: string; at_secs: number | null }[];
  voicemailUrl: string | null;
  taskId: string | null;
};

export async function listCalls(workspaceId: string): Promise<CallRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionist_calls")
    .select(
      "id, from_number, started_at, duration_secs, language, outcome, route_name, caller_name, contact_id, summary, summary_source, transcript, voicemail_url, task_id, contact:contacts!receptionist_calls_workspace_id_contact_id_fkey(full_name)",
    )
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    fromNumber: c.from_number,
    startedAt: c.started_at,
    durationSecs: c.duration_secs,
    language: c.language,
    outcome: c.outcome as CallRow["outcome"],
    routeName: c.route_name,
    callerName: c.caller_name,
    contactId: c.contact_id,
    contactName: c.contact?.full_name ?? null,
    summary: c.summary,
    summarySource: c.summary_source,
    transcript: Array.isArray(c.transcript) ? (c.transcript as CallRow["transcript"]) : [],
    voicemailUrl: c.voicemail_url,
    taskId: c.task_id,
  }));
}
