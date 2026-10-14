"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { estimateSchema, estimateStatusSchema } from "../../validation";

const ids = z.object({ workspaceId: z.uuid(), estimateId: z.uuid() });

export async function createEstimate(input: {
  workspaceId: string;
  dealId: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ workspaceId: z.uuid(), dealId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = parsed.data;

  const { data: latest } = await ctx.supabase
    .from("azh_estimates")
    .select("version")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .order("version", { ascending: false })
    .limit(1);
  const version = (latest?.[0]?.version ?? 0) + 1;
  const { data, error } = await ctx.supabase
    .from("azh_estimates")
    .insert({ workspace_id: workspaceId, deal_id: dealId, version, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_estimate.create",
    entityType: "azh_estimate",
    entityId: data.id,
    diff: { deal_id: dealId, version },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function saveEstimate(
  input: z.input<typeof ids> & { estimate: unknown },
): Promise<ActionResult<{ total: number }>> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = estimateSchema.safeParse(input.estimate);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, estimateId } = env.data;
  const e = parsed.data;

  const { data: current } = await ctx.supabase
    .from("azh_estimates")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("id", estimateId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Estimate not found." };
  if (current.status !== "draft")
    return {
      ok: false,
      error: "Only drafts can be edited. Use “Duplicate to revise” to change a sent estimate.",
    };

  const { data, error } = await ctx.supabase.rpc("azh_save_estimate", {
    p_estimate_id: estimateId,
    p_title: e.title,
    p_markup_pct: e.markup_pct,
    p_tax_pct: e.tax_pct,
    p_valid_until: e.valid_until ?? undefined,
    p_notes: e.notes ?? undefined,
    p_items: e.items,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_estimate.update",
    entityType: "azh_estimate",
    entityId: estimateId,
    diff: { lines: e.items.length, total: data.total },
  });
  revalidateWorkspace();
  return { ok: true, data: { total: data.total } };
}

export async function setEstimateStatus(
  input: z.input<typeof ids> & { status: string },
): Promise<ActionResult> {
  const env = ids.safeParse(input);
  const status = estimateStatusSchema.safeParse(input.status);
  if (!env.success || !status.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, estimateId } = env.data;
  const { data, error } = await ctx.supabase
    .from("azh_estimates")
    .update({ status: status.data })
    .eq("workspace_id", workspaceId)
    .eq("id", estimateId)
    .select("id, deal_id, version");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change estimates in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_estimate.status",
    entityType: "azh_estimate",
    entityId: estimateId,
    diff: { status: status.data },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function duplicateEstimate(
  input: z.input<typeof ids>,
): Promise<ActionResult<{ id: string; version: number }>> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, estimateId } = env.data;
  const { data, error } = await ctx.supabase.rpc("azh_duplicate_estimate", {
    p_estimate_id: estimateId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_estimate.revise",
    entityType: "azh_estimate",
    entityId: data.id,
    diff: { revised_from: estimateId, version: data.version },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id, version: data.version } };
}

export async function deleteEstimate(input: z.input<typeof ids>): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, estimateId } = env.data;
  const { data, error } = await ctx.supabase
    .from("azh_estimates")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", estimateId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Only draft estimates can be deleted." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_estimate.delete",
    entityType: "azh_estimate",
    entityId: estimateId,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
