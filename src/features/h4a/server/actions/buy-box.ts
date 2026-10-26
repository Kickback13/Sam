"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { buyBoxInputSchema } from "../../scoring/buy-box-schema";
import { rescoreOpenListings } from "../rescore";

const envelope = z.object({ workspaceId: z.uuid(), buyBox: z.unknown() });

/** Save the buy box (owners/admins — enforced by RLS), then re-score every open listing. */
export async function saveBuyBox(
  input: z.input<typeof envelope>,
): Promise<ActionResult<{ version: number; rescored: number }>> {
  const env = envelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = buyBoxInputSchema.safeParse(env.data.buyBox);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId } = env.data;
  const row = parsed.data;

  const { data: before } = await ctx.supabase
    .from("h4a_buy_boxes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from("h4a_buy_boxes")
    .upsert({ workspace_id: workspaceId, ...row }, { onConflict: "workspace_id" })
    .select("version")
    .single();
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only owners and admins can edit the buy box."
          : friendlyDbError(error),
    };

  let rescored = 0;
  try {
    rescored = (await rescoreOpenListings(ctx.supabase, workspaceId)).scored;
  } catch (e) {
    console.error("h4a rescore failed", e);
  }
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: before ? "buy_box.update" : "buy_box.create",
    entityType: "buy_box",
    diff: {
      ...diffFields(before as Record<string, unknown> | null, row as Record<string, unknown>),
      rescored,
    },
  });
  revalidateWorkspace();
  return { ok: true, data: { version: data.version, rescored } };
}
