"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { companyInputSchema } from "@/lib/validation/company";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

const saveSchema = z.object({ workspaceId: z.uuid(), companyId: z.uuid().optional(), company: z.unknown() });

export async function saveCompany(input: z.input<typeof saveSchema>): Promise<ActionResult<{ id: string }>> {
  const envelope = saveSchema.safeParse(input);
  if (!envelope.success) return { ok: false, error: "Invalid request" };
  const parsed = companyInputSchema.safeParse(envelope.data.company);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, companyId } = envelope.data;
  const row = parsed.data;

  if (companyId) {
    const { data: before } = await ctx.supabase.from("companies").select("*").eq("workspace_id", workspaceId).eq("id", companyId).maybeSingle();
    if (!before) return { ok: false, error: "Company not found." };
    const { data, error } = await ctx.supabase.from("companies").update(row).eq("workspace_id", workspaceId).eq("id", companyId).select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data?.length) return { ok: false, error: "You can't edit companies in this workspace." };
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "company.update",
      entityType: "company",
      entityId: companyId,
      diff: diffFields(before as Record<string, unknown>, row as Record<string, unknown>, Object.keys(row)),
    });
    revalidateWorkspace();
    return { ok: true, data: { id: companyId } };
  }

  const { data, error } = await ctx.supabase
    .from("companies")
    .insert({ ...row, workspace_id: workspaceId, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "company.create",
    entityType: "company",
    entityId: data.id,
    diff: diffFields(null, row as Record<string, unknown>),
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function deleteCompany(input: { workspaceId: string; companyId: string }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), companyId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("id", parsed.data.companyId)
    .select("id, name");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete companies in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "company.delete",
    entityType: "company",
    entityId: parsed.data.companyId,
    diff: { name: data[0].name, soft_delete: true },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
