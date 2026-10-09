import "server-only";

import { toJson } from "@/lib/db/json";
import type { ServerSupabase } from "@/lib/supabase/server";

type AuditEntry = {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
};

/** Append to audit_log under the user's session. Never blocks the user action on failure. */
export async function writeAudit(supabase: ServerSupabase, entry: AuditEntry) {
  const { error } = await supabase.from("audit_log").insert({
    workspace_id: entry.workspaceId,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    diff: toJson(entry.diff ?? {}),
  });
  if (error) console.error("audit_log insert failed", { action: entry.action, code: error.code, message: error.message });
}

/** { field: { from, to } } for fields whose value changed. */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields?: readonly string[],
): Record<string, { from: unknown; to: unknown }> {
  const keys = fields ?? Object.keys(after);
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before ? before[key] ?? null : null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) out[key] = { from, to };
  }
  return out;
}
