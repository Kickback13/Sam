"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { milestoneSchema } from "../../validation";

export async function addMilestone(input: {
  workspaceId: string;
  dealId: string;
  milestone: unknown;
}): Promise<ActionResult<{ id: string }>> {
  const ids = z.object({ workspaceId: z.uuid(), dealId: z.uuid() }).safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const parsed = milestoneSchema.safeParse(input.milestone);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = ids.data;
  const { count } = await ctx.supabase
    .from("azh_milestones")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId);
  const { data, error } = await ctx.supabase
    .from("azh_milestones")
    .insert({
      ...parsed.data,
      workspace_id: workspaceId,
      deal_id: dealId,
      position: count ?? 0,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_milestone.create",
    entityType: "azh_milestone",
    entityId: data.id,
    diff: parsed.data,
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function updateMilestone(input: {
  workspaceId: string;
  milestoneId: string;
  milestone: unknown;
}): Promise<ActionResult> {
  const ids = z.object({ workspaceId: z.uuid(), milestoneId: z.uuid() }).safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const parsed = milestoneSchema.partial().safeParse(input.milestone);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, milestoneId } = ids.data;
  const { data, error } = await ctx.supabase
    .from("azh_milestones")
    .update(parsed.data)
    .eq("workspace_id", workspaceId)
    .eq("id", milestoneId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change milestones in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_milestone.update",
    entityType: "azh_milestone",
    entityId: milestoneId,
    diff: parsed.data,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteMilestone(input: {
  workspaceId: string;
  milestoneId: string;
}): Promise<ActionResult> {
  const ids = z.object({ workspaceId: z.uuid(), milestoneId: z.uuid() }).safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, milestoneId } = ids.data;
  const { data, error } = await ctx.supabase
    .from("azh_milestones")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", milestoneId)
    .select("id, name");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete milestones in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_milestone.delete",
    entityType: "azh_milestone",
    entityId: milestoneId,
    diff: { name: data[0].name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
