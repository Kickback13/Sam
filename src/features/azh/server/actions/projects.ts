"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { projectSchema } from "../../validation";

const envelope = z.object({ workspaceId: z.uuid(), dealId: z.uuid(), project: z.unknown() });

/** Create or update the AZH details row for a project (deal). */
export async function saveProject(input: z.input<typeof envelope>): Promise<ActionResult> {
  const env = envelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = projectSchema.safeParse(env.data.project);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = env.data;

  const { data: before } = await ctx.supabase
    .from("azh_projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from("azh_projects")
    .upsert(
      { ...parsed.data, deal_id: dealId, workspace_id: workspaceId },
      { onConflict: "deal_id" },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: before ? "azh_project.update" : "azh_project.create",
    entityType: "deal",
    entityId: dealId,
    diff: diffFields(
      before as Record<string, unknown> | null,
      parsed.data,
      Object.keys(parsed.data),
    ),
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
