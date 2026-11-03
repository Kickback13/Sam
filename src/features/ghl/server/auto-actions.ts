"use server";

import { after } from "next/server";
import { z } from "zod";

import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { describeSummary, isSyncDue, type SyncSummary } from "../sync";
import { runGhlAutoImport } from "./auto-import";

const settingsSchema = z.object({
  workspaceId: z.uuid(),
  enabled: z.boolean(),
  intervalMinutes: z.union([z.literal(60), z.literal(360), z.literal(1440)]),
});

/** Owner/admin: turn the automatic import on or off and choose how often it runs. */
export async function saveGhlAutoImport(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, enabled, intervalMinutes } = parsed.data;
  const { error } = await ctx.supabase.from("ghl_sync_settings").upsert(
    {
      workspace_id: workspaceId,
      enabled,
      interval_minutes: intervalMinutes,
      enabled_by: enabled ? ctx.user.id : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only owners and admins can change the automatic import."
          : friendlyDbError(error),
    };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: enabled ? "ghl.auto_import_on" : "ghl.auto_import_off",
    entityType: "integration",
    diff: { interval_minutes: intervalMinutes },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const wsSchema = z.object({ workspaceId: z.uuid() });

/** "Import now": run immediately (the person waits for the result). */
export async function runGhlAutoImportNow(
  input: z.input<typeof wsSchema>,
): Promise<ActionResult<{ summary: SyncSummary; text: string }>> {
  const parsed = wsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  try {
    const r = await runGhlAutoImport(ctx, parsed.data.workspaceId, { force: true });
    if (!r.ran)
      return {
        ok: false,
        error:
          "An import is already running, or GoHighLevel isn't connected. Try again in a minute.",
      };
    revalidateWorkspace();
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { summary: r.summary, text: describeSummary(r.summary) } };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err as { code?: string; message?: string }) };
  }
}

/**
 * Called quietly by the app shell when an owner/admin opens a workspace. If an automatic
 * import is due, it starts after this action has returned, so it never holds up the page or
 * the person's own clicks. Nothing happens if it's off, not due, or already running.
 */
export async function kickGhlAutoImport(
  input: z.input<typeof wsSchema>,
): Promise<{ started: boolean }> {
  const parsed = wsSchema.safeParse(input);
  if (!parsed.success) return { started: false };
  const ctx = await actionContext();
  if (!ctx) return { started: false };
  const { data } = await ctx.supabase
    .from("ghl_sync_settings")
    .select("enabled, interval_minutes, last_started_at, lock_until")
    .eq("workspace_id", parsed.data.workspaceId)
    .maybeSingle();
  if (!data || !isSyncDue(data, new Date())) return { started: false };
  after(async () => {
    try {
      const run = await actionContext();
      if (run) await runGhlAutoImport(run, parsed.data.workspaceId);
    } catch (err) {
      console.error("GHL automatic import failed", err instanceof Error ? err.message : err);
    }
  });
  return { started: true };
}
