import "server-only";

import { toJson } from "@/lib/db/json";
import { normalizePhone } from "@/lib/normalize";
import type { ActionContext } from "@/server/action-context";
import { friendlyDbError } from "@/server/errors";

import { GhlClient, GhlError, ghlBaseUrl, type GhlContact } from "../client";
import { smsBlockedPhones, type DealPlan, type StageMap } from "../map";

/**
 * Helpers shared by the one-time import (actions.ts) and the automatic import
 * (auto-import.ts). Everything runs under the signed-in owner/admin's session.
 */

export type StepError = { ok: false; error: string; retryAfterSeconds?: number };

export function ghlFailure(err: unknown): StepError {
  if (err instanceof GhlError)
    return {
      ok: false,
      error: err.message,
      ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    };
  console.error("GHL import failed", err instanceof Error ? err.message : err);
  return { ok: false, error: "Something went wrong talking to GoHighLevel." };
}

/** The workspace's GHL client, built from the Vault token (owners/admins only — enforced in SQL). */
export async function ghlClient(
  ctx: ActionContext,
  workspaceId: string,
): Promise<GhlClient | null> {
  const { data, error } = await ctx.supabase.rpc("ghl_connection", { p_workspace_id: workspaceId });
  if (error || !data?.[0]?.token || !data[0].location_id) return null;
  return new GhlClient(data[0].token, data[0].location_id, fetch, ghlBaseUrl());
}

export const NOT_CONNECTED = {
  ok: false as const,
  error: "GoHighLevel isn't connected for this workspace (or you're not an owner/admin).",
};

export async function recordError(ctx: ActionContext, workspaceId: string, err: unknown) {
  if (err instanceof GhlError && (err.kind === "auth" || err.kind === "scope"))
    await ctx.supabase.rpc("ghl_record_error", {
      p_workspace_id: workspaceId,
      p_message: err.message,
    });
}

/** Texting turned off in GHL → the do-not-send list. Returns how many numbers were added. */
export async function suppressSmsDnd(
  ctx: ActionContext,
  workspaceId: string,
  contacts: GhlContact[],
): Promise<number> {
  const blocked = [
    ...new Set(
      contacts
        .flatMap(smsBlockedPhones)
        .map((p) => normalizePhone(p))
        .filter((p): p is string => p !== null && /^\+[0-9]{8,15}$/.test(p)),
    ),
  ];
  if (!blocked.length) return 0;
  const { data, error } = await ctx.supabase
    .from("outreach_suppressions")
    .upsert(
      blocked.map((value) => ({
        workspace_id: workspaceId,
        channel: "sms",
        value,
        reason: "manual",
        note: "Texting was off (DND) in GoHighLevel",
      })),
      { onConflict: "workspace_id,channel,value", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("GHL SMS DND suppressions failed", { code: error.code });
    return 0;
  }
  return data?.length ?? 0;
}

/** Insert the deal for a GHL opportunity and link the two, so later runs never duplicate it. */
export async function createDealFromPlan(
  ctx: ActionContext,
  workspaceId: string,
  ghlId: string,
  plan: Extract<DealPlan, { action: "create" }>,
  opts: { contactId: string | null; position: number },
): Promise<{ ok: true; dealId: string } | { ok: false; error: string }> {
  const { data: deal, error } = await ctx.supabase
    .from("deals")
    .insert({
      workspace_id: workspaceId,
      pipeline_id: plan.pipelineId,
      stage_id: plan.stageId,
      title: plan.title,
      value: plan.value,
      source: plan.source,
      primary_contact_id: opts.contactId,
      position: opts.position,
      notes: `Imported from GoHighLevel (opportunity ${ghlId}).`,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !deal) return { ok: false, error: friendlyDbError(error) };
  const { error: linkError } = await ctx.supabase.from("ghl_links").insert({
    workspace_id: workspaceId,
    object: "opportunity",
    ghl_id: ghlId,
    local_id: deal.id,
  });
  if (linkError) console.error("ghl_links insert failed", { code: linkError.code });
  return { ok: true, dealId: deal.id };
}

/** Remember the stage map an admin chose, for the automatic import. Best effort. */
export async function saveStageMap(ctx: ActionContext, workspaceId: string, stageMap: StageMap) {
  const { error } = await ctx.supabase.from("ghl_sync_settings").upsert(
    {
      workspace_id: workspaceId,
      stage_map: toJson(stageMap),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) console.error("GHL stage map save failed", { code: error.code });
}
