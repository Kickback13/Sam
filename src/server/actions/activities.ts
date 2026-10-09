"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { activityInputSchema } from "@/lib/validation/activity";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

export async function logActivity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = activityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: zodFieldErrors(parsed.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const a = parsed.data;

  const metadata: Record<string, unknown> = {};
  if (a.outcome) metadata.outcome = a.outcome;
  if (a.duration_minutes !== null) metadata.duration_minutes = a.duration_minutes;

  const { data, error } = await ctx.supabase
    .from("activities")
    .insert({
      workspace_id: a.workspaceId,
      type: a.type,
      subject_type: a.subject_type,
      subject_id: a.subject_id,
      body: a.body,
      occurred_at: a.occurred_at ?? new Date().toISOString(),
      metadata: toJson(metadata),
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(ctx.supabase, {
    workspaceId: a.workspaceId,
    actorId: ctx.user.id,
    action: `activity.${a.type}.create`,
    entityType: a.subject_type,
    entityId: a.subject_id,
    diff: { activity_id: data.id, type: a.type },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function deleteActivity(input: { workspaceId: string; activityId: string }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), activityId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const { data, error } = await ctx.supabase
    .from("activities")
    .delete()
    .eq("id", parsed.data.activityId)
    .eq("workspace_id", parsed.data.workspaceId)
    .select("id, type, subject_type, subject_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can only delete notes and calls you logged." };

  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "activity.delete",
    entityType: data[0].subject_type,
    entityId: data[0].subject_id,
    diff: { activity_id: data[0].id, type: data[0].type },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
