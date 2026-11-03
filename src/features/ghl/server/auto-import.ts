import "server-only";

import type { ActionContext } from "@/server/action-context";
import { finishImport, importChunk, startImport } from "@/server/actions/imports";
import { friendlyDbError } from "@/server/errors";

import { GhlError, type GhlContact, type GhlCursor, type GhlOpportunity } from "../client";
import { defaultStageMap, GHL_COLUMN_MAPPING, ghlContactToRow, type StageMap } from "../map";
import {
  changedContacts,
  emptySummary,
  opportunityFingerprint,
  planOpportunitySync,
  type SyncSummary,
} from "../sync";
import { defaultPipelineId, loadLocalStages } from "./queries";
import { createDealFromPlan, ghlClient, recordError, suppressSmsDnd } from "./shared";

/** Stop starting new pages after this long; the next run picks up the rest. */
const DEFAULT_BUDGET_MS = 120_000;
/** Contact pages of 100: a hard cap per run (20,000 contacts). */
const MAX_PAGES = 200;

export type AutoImportResult =
  | { ran: false; reason: "not_due" | "not_connected" }
  | { ran: true; ok: true; summary: SyncSummary }
  | { ran: true; ok: false; error: string; summary: SyncSummary };

type StateRow = { ghl_id: string; fingerprint: string };

async function loadStates(
  ctx: ActionContext,
  workspaceId: string,
  object: "contact" | "opportunity",
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await ctx.supabase
    .from("ghl_sync_state")
    .select("ghl_id, fingerprint")
    .eq("workspace_id", workspaceId)
    .eq("object", object)
    .in("ghl_id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as StateRow[]).map((r) => [r.ghl_id, r.fingerprint]));
}

async function saveStates(
  ctx: ActionContext,
  workspaceId: string,
  object: "contact" | "opportunity",
  rows: StateRow[],
) {
  if (!rows.length) return;
  const syncedAt = new Date().toISOString();
  const { error } = await ctx.supabase.from("ghl_sync_state").upsert(
    rows.map((r) => ({
      workspace_id: workspaceId,
      object,
      ghl_id: r.ghl_id,
      fingerprint: r.fingerprint,
      synced_at: syncedAt,
    })),
    { onConflict: "workspace_id,object,ghl_id" },
  );
  if (error) throw error;
}

/**
 * One automatic import run for a workspace: contacts, then opportunities.
 * Runs under the signed-in owner/admin's session (RLS applies to every write) and
 * only if the database lock says a run is due (or `force`, for "Import now").
 */
export async function runGhlAutoImport(
  ctx: ActionContext,
  workspaceId: string,
  opts: { force?: boolean; budgetMs?: number } = {},
): Promise<AutoImportResult> {
  const { data: claimed, error: claimError } = await ctx.supabase.rpc("ghl_sync_claim", {
    p_workspace_id: workspaceId,
    p_force: opts.force ?? false,
  });
  if (claimError) throw claimError;
  if (!claimed) return { ran: false, reason: opts.force ? "not_connected" : "not_due" };

  const summary = emptySummary();
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  let error: string | null = null;
  try {
    const client = await ghlClient(ctx, workspaceId);
    if (!client) throw new Error("GoHighLevel isn't connected for this workspace.");
    await importContacts(ctx, workspaceId, client, summary, deadline);
    if (!summary.partial) await importOpportunities(ctx, workspaceId, client, summary, deadline);
  } catch (err) {
    await recordError(ctx, workspaceId, err).catch(() => undefined);
    error =
      err instanceof GhlError
        ? err.message
        : err instanceof Error
          ? err.message
          : friendlyDbError(err as { code?: string; message?: string });
  }

  const { error: finishError } = await ctx.supabase.rpc("ghl_sync_finish", {
    p_workspace_id: workspaceId,
    p_ok: error === null,
    p_summary: summary,
    p_error: error ?? "",
  });
  if (finishError) console.error("ghl_sync_finish failed", { code: finishError.code });
  return error === null
    ? { ran: true, ok: true, summary }
    : { ran: true, ok: false, error, summary };
}

type Client = NonNullable<Awaited<ReturnType<typeof ghlClient>>>;

async function importContacts(
  ctx: ActionContext,
  workspaceId: string,
  client: Client,
  summary: SyncSummary,
  deadline: number,
) {
  let cursor: GhlCursor = null;
  let importId: string | null = null;
  let rowOffset = 0;
  let failed = false;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (Date.now() > deadline) {
        summary.partial = true;
        break;
      }
      const res: { items: GhlContact[]; next: GhlCursor; total: number | null } =
        await client.listContacts(cursor);
      summary.contacts.checked += res.items.length;
      const seen = await loadStates(
        ctx,
        workspaceId,
        "contact",
        res.items.map((c) => c.id),
      );
      const changed = changedContacts(res.items, seen);
      if (changed.length) {
        summary.contacts.changed += changed.length;
        if (!importId) {
          const started = await startImport({
            workspaceId,
            filename: "GoHighLevel (automatic import)",
            mapping: GHL_COLUMN_MAPPING,
            dedupeStrategy: "update",
            totalRows: Math.min(Math.max(res.total ?? changed.length, changed.length), 20_000),
            defaultSource: "GoHighLevel",
          });
          if (!started.ok) throw new Error(started.error);
          importId = started.data.importId;
        }
        const chunk = await importChunk({
          workspaceId,
          importId,
          rows: changed.map((c, i) => ({
            row: rowOffset + i + 1,
            raw: ghlContactToRow(c.contact),
          })),
        });
        if (!chunk.ok) throw new Error(chunk.error);
        summary.contacts.created += chunk.data.created;
        summary.contacts.updated += chunk.data.updated;
        const failedRows = new Set(
          chunk.data.errors.filter((e) => !e.message.startsWith("Skipped:")).map((e) => e.row),
        );
        summary.contacts.errors += failedRows.size;
        await suppressSmsDnd(
          ctx,
          workspaceId,
          changed.map((c) => c.contact),
        );
        // Remember what we imported; rows that failed are retried next run.
        await saveStates(
          ctx,
          workspaceId,
          "contact",
          changed
            .filter((_, i) => !failedRows.has(rowOffset + i + 1))
            .map((c) => ({ ghl_id: c.contact.id, fingerprint: c.fingerprint })),
        );
        rowOffset += changed.length;
      }
      cursor = res.next;
      if (!cursor) break;
    }
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    if (importId) await finishImport({ workspaceId, importId, failed });
  }
}

async function importOpportunities(
  ctx: ActionContext,
  workspaceId: string,
  client: Client,
  summary: SyncSummary,
  deadline: number,
) {
  const [local, pipelines, settings] = await Promise.all([
    loadLocalStages(workspaceId, ctx.supabase),
    client.getPipelines(),
    ctx.supabase
      .from("ghl_sync_settings")
      .select("stage_map")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  let stageMap = (settings.data?.stage_map ?? {}) as StageMap;
  if (!Object.keys(stageMap).length) {
    const pipelineId = await defaultPipelineId(workspaceId);
    stageMap = pipelineId ? defaultStageMap(pipelines, local, pipelineId) : {};
  }

  // New cards go to the bottom, in GHL order.
  const { data: maxRow } = await ctx.supabase
    .from("deals")
    .select("position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (maxRow?.position ?? 0) + 1000;

  let cursor: GhlCursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() > deadline) {
      summary.partial = true;
      break;
    }
    const res: { items: GhlOpportunity[]; next: GhlCursor } =
      await client.searchOpportunities(cursor);
    summary.opportunities.checked += res.items.length;
    const ids = res.items.map((o) => o.id);
    const contactGhlIds = [
      ...new Set(res.items.map((o) => o.contactId).filter((x): x is string => Boolean(x))),
    ];
    const [seen, links, contacts] = await Promise.all([
      loadStates(ctx, workspaceId, "opportunity", ids),
      ids.length
        ? ctx.supabase
            .from("ghl_links")
            .select("ghl_id, local_id")
            .eq("workspace_id", workspaceId)
            .eq("object", "opportunity")
            .in("ghl_id", ids)
        : Promise.resolve({ data: [], error: null }),
      contactGhlIds.length
        ? ctx.supabase
            .from("contacts")
            .select("id, ghl_contact_id")
            .eq("workspace_id", workspaceId)
            .is("deleted_at", null)
            .in("ghl_contact_id", contactGhlIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (links.error) throw links.error;
    if (contacts.error) throw contacts.error;
    const dealByGhl = new Map(
      ((links.data ?? []) as { ghl_id: string; local_id: string }[]).map((l) => [
        l.ghl_id,
        l.local_id,
      ]),
    );
    const contactByGhl = new Map(
      ((contacts.data ?? []) as { id: string; ghl_contact_id: string | null }[]).map((c) => [
        c.ghl_contact_id,
        c.id,
      ]),
    );

    const remember: StateRow[] = [];
    for (const o of res.items) {
      const plan = planOpportunitySync({
        opportunity: o,
        previous: seen.get(o.id),
        linkedDealId: dealByGhl.get(o.id),
        stageMap,
        local,
      });
      const fp = opportunityFingerprint(o);
      if (plan.kind === "unchanged") continue;
      if (plan.kind === "baseline" || plan.kind === "skip") {
        if (plan.kind === "skip") summary.opportunities.skipped += 1;
        remember.push({ ghl_id: o.id, fingerprint: fp });
        continue;
      }
      if (plan.kind === "create") {
        const made = await createDealFromPlan(ctx, workspaceId, o.id, plan.plan, {
          contactId: plan.plan.contactGhlId
            ? (contactByGhl.get(plan.plan.contactGhlId) ?? null)
            : null,
          position,
        });
        if (!made.ok) {
          summary.opportunities.skipped += 1;
          continue; // not remembered: retried next run
        }
        position += 1000;
        summary.opportunities.created += 1;
        remember.push({ ghl_id: o.id, fingerprint: fp });
        continue;
      }
      // update: GHL moved the opportunity (or changed its value) since the last run.
      const { data: updated, error } = await ctx.supabase
        .from("deals")
        .update({ stage_id: plan.stageId, ...(plan.value !== null ? { value: plan.value } : {}) })
        .eq("workspace_id", workspaceId)
        .eq("id", plan.dealId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        summary.opportunities.skipped += 1;
        continue;
      }
      if (updated?.length) summary.opportunities.moved += 1;
      remember.push({ ghl_id: o.id, fingerprint: fp });
    }
    await saveStates(ctx, workspaceId, "opportunity", remember);
    cursor = res.next;
    if (!cursor) break;
  }
}
