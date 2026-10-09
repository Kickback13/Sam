"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { taskInputSchema } from "@/lib/validation/task";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check the form", fieldErrors: zodFieldErrors(parsed.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const t = parsed.data;

  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      workspace_id: t.workspaceId,
      title: t.title,
      notes: t.notes,
      due_at: t.due_at,
      // Default to the creator so it shows up in their "My tasks".
      assigned_to: t.assigned_to ?? ctx.user.id,
      related_type: t.related_type,
      related_id: t.related_id,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(ctx.supabase, {
    workspaceId: t.workspaceId,
    actorId: ctx.user.id,
    action: "task.create",
    entityType: "task",
    entityId: data.id,
    diff: { title: t.title, due_at: t.due_at, assigned_to: t.assigned_to ?? ctx.user.id },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

const setStatusSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
  status: z.enum(["open", "done", "canceled"]),
});

export async function setTaskStatus(input: z.input<typeof setStatusSchema>): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, taskId, status } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change tasks in this workspace." };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: `task.${status}`,
    entityType: "task",
    entityId: taskId,
    diff: { status },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteTask(input: {
  workspaceId: string;
  taskId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), taskId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", parsed.data.taskId)
    .eq("workspace_id", parsed.data.workspaceId)
    .select("id, title");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete tasks in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "task.delete",
    entityType: "task",
    entityId: parsed.data.taskId,
    diff: { title: data[0].title },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
