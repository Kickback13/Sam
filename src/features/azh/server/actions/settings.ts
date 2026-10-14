"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { parseZipList } from "../../routing";
import { azhSettingsSchema } from "../../validation";

export async function saveAzhSettings(input: {
  workspaceId: string;
  settings: unknown;
}): Promise<ActionResult> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const parsed = azhSettingsSchema.safeParse(input.settings);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const { data: before } = await ctx.supabase
    .from("azh_settings")
    .select("*")
    .eq("workspace_id", ws.data)
    .maybeSingle();
  if (!before) return { ok: false, error: "AZH settings aren't available for this workspace." };
  const { data, error } = await ctx.supabase
    .from("azh_settings")
    .update(parsed.data)
    .eq("workspace_id", ws.data)
    .select("workspace_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Only owners and admins can change AZH settings." };
  await writeAudit(ctx.supabase, {
    workspaceId: ws.data,
    actorId: ctx.user.id,
    action: "azh_settings.update",
    entityType: "workspace",
    entityId: ws.data,
    diff: diffFields(before as Record<string, unknown>, parsed.data, Object.keys(parsed.data)),
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function saveFallbrookZips(input: {
  workspaceId: string;
  zipsText: string;
}): Promise<ActionResult<{ count: number }>> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success || typeof input.zipsText !== "string" || input.zipsText.length > 20000)
    return { ok: false, error: "Invalid request" };
  const { zips, invalid } = parseZipList(input.zipsText);
  if (invalid.length)
    return {
      ok: false,
      error: `These aren't 5-digit ZIPs: ${invalid.slice(0, 8).join(", ")}${invalid.length > 8 ? "…" : ""}`,
      fieldErrors: { zips: ["Use 5-digit ZIPs separated by commas, spaces or new lines"] },
    };
  if (zips.length > 2000) return { ok: false, error: "At most 2,000 ZIPs." };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("azh_replace_fallbrook_zips", {
    p_workspace_id: ws.data,
    p_zips: zips,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: ws.data,
    actorId: ctx.user.id,
    action: "azh_zip_routes.replace",
    entityType: "workspace",
    entityId: ws.data,
    diff: { fallbrook_zips: zips },
  });
  revalidateWorkspace();
  return { ok: true, data: { count: data } };
}
