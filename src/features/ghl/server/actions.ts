"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { finishImport, importChunk, startImport } from "@/server/actions/imports";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { GhlClient, ghlBaseUrl, type GhlCursor } from "../client";
import { GHL_COLUMN_MAPPING, ghlContactToRow, planOpportunity } from "../map";
import { loadLocalStages } from "./queries";
import {
  createDealFromPlan,
  ghlClient,
  ghlFailure,
  NOT_CONNECTED,
  recordError,
  saveStageMap,
  suppressSmsDnd,
  type StepError,
} from "./shared";

const cursorSchema = z
  .object({ startAfterId: z.string().min(1).max(100), startAfter: z.number() })
  .nullable();

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------
const connectSchema = z.object({
  workspaceId: z.uuid(),
  token: z.string().trim().min(10, "Paste the whole token").max(4000),
  locationId: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_-]{5,64}$/,
      "Copy the Location ID from GoHighLevel → Settings → Business Profile",
    ),
  label: z.string().trim().max(200).optional(),
});

export type ConnectResult = { contacts: number | null; pipelines: number };

/** Test the token (contacts + opportunities scopes), then store it in Vault. */
export async function connectGhl(
  input: z.input<typeof connectSchema>,
): Promise<ActionResult<ConnectResult>> {
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), [i.message]]),
      ),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, token, locationId, label } = parsed.data;

  const client = new GhlClient(token, locationId, fetch, ghlBaseUrl());
  let result: ConnectResult;
  try {
    const [contacts, pipelines] = await Promise.all([
      client.listContacts(null, 1),
      client.getPipelines(),
    ]);
    result = { contacts: contacts.total, pipelines: pipelines.length };
  } catch (err) {
    return ghlFailure(err);
  }

  const { error } = await ctx.supabase.rpc("ghl_save_connection", {
    p_workspace_id: workspaceId,
    p_token: token,
    p_location_id: locationId,
    p_location_name: label || "",
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only an owner or admin can connect GoHighLevel."
          : friendlyDbError(error),
    };
  revalidateWorkspace();
  return { ok: true, data: result };
}

export async function disconnectGhl(input: { workspaceId: string }): Promise<ActionResult> {
  const workspaceId = z.uuid().safeParse(input.workspaceId);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.rpc("ghl_disconnect", { p_workspace_id: workspaceId.data });
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only an owner or admin can disconnect GoHighLevel."
          : friendlyDbError(error),
    };
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Contacts: GHL pages → the existing contact import (same dedupe + report)
// ---------------------------------------------------------------------------
export async function startGhlContactImport(input: {
  workspaceId: string;
  extraTags?: string[];
}): Promise<ActionResult<{ importId: string; total: number }>> {
  const workspaceId = z.uuid().safeParse(input.workspaceId);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const client = await ghlClient(ctx, workspaceId.data);
  if (!client) return NOT_CONNECTED;
  let total: number;
  try {
    total = (await client.listContacts(null, 1)).total ?? 0;
  } catch (err) {
    await recordError(ctx, workspaceId.data, err);
    return ghlFailure(err);
  }
  if (total === 0) return { ok: false, error: "GoHighLevel has no contacts for this location." };
  const started = await startImport({
    workspaceId: workspaceId.data,
    filename: "GoHighLevel (API import)",
    mapping: GHL_COLUMN_MAPPING,
    dedupeStrategy: "update",
    totalRows: Math.min(total, 20_000),
    extraTags: (input.extraTags ?? []).slice(0, 5),
    defaultSource: "GoHighLevel",
  });
  if (!started.ok) return started;
  return { ok: true, data: { importId: started.data.importId, total } };
}

const contactStepSchema = z.object({
  workspaceId: z.uuid(),
  importId: z.uuid(),
  cursor: cursorSchema,
  rowOffset: z.number().int().min(0).max(1_000_000),
});

export type ContactStep = {
  next: GhlCursor;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  smsBlocked: number;
};

/** Import one page (100 contacts). The client loops until `next` is null, then calls finishGhlContactImport. */
export async function importGhlContactsPage(
  input: z.input<typeof contactStepSchema>,
): Promise<ActionResult<ContactStep> | StepError> {
  const parsed = contactStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, importId, cursor, rowOffset } = parsed.data;
  const client = await ghlClient(ctx, workspaceId);
  if (!client) return NOT_CONNECTED;

  let page;
  try {
    page = await client.listContacts(cursor);
  } catch (err) {
    await recordError(ctx, workspaceId, err);
    return ghlFailure(err);
  }
  const step: ContactStep = {
    next: page.next,
    fetched: page.items.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    smsBlocked: 0,
  };
  if (page.items.length === 0) return { ok: true, data: step };

  const chunk = await importChunk({
    workspaceId,
    importId,
    rows: page.items.map((c, i) => ({ row: rowOffset + i + 1, raw: ghlContactToRow(c) })),
  });
  if (!chunk.ok) return chunk;
  step.created = chunk.data.created;
  step.updated = chunk.data.updated;
  step.skipped = chunk.data.skipped;
  step.errors = chunk.data.errors.filter((e) => !e.message.startsWith("Skipped:")).length;

  // Texting turned off in GHL → the do-not-send list (survives later edits and re-imports).
  step.smsBlocked = await suppressSmsDnd(ctx, workspaceId, page.items);
  return { ok: true, data: step };
}

export async function finishGhlContactImport(input: {
  workspaceId: string;
  importId: string;
  failed?: boolean;
}): Promise<ActionResult> {
  return finishImport(input);
}

// ---------------------------------------------------------------------------
// Opportunities → deals (after contacts, so each deal links to its contact)
// ---------------------------------------------------------------------------
const oppStepSchema = z.object({
  workspaceId: z.uuid(),
  cursor: cursorSchema,
  stageMap: z
    .record(z.string().min(1).max(100), z.uuid())
    .refine((m) => Object.keys(m).length <= 500),
});

export type OpportunityStep = {
  next: GhlCursor;
  fetched: number;
  created: number;
  alreadyImported: number;
  skipped: { id: string; name: string | null; reason: string }[];
};

export async function importGhlOpportunitiesPage(
  input: z.input<typeof oppStepSchema>,
): Promise<ActionResult<OpportunityStep> | StepError> {
  const parsed = oppStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, cursor, stageMap } = parsed.data;
  const client = await ghlClient(ctx, workspaceId);
  if (!client) return NOT_CONNECTED;
  // The automatic import (Phase 5B) reuses the stage map chosen here.
  if (cursor === null) await saveStageMap(ctx, workspaceId, stageMap);

  let page;
  try {
    page = await client.searchOpportunities(cursor);
  } catch (err) {
    await recordError(ctx, workspaceId, err);
    return ghlFailure(err);
  }
  const step: OpportunityStep = {
    next: page.next,
    fetched: page.items.length,
    created: 0,
    alreadyImported: 0,
    skipped: [],
  };
  if (page.items.length === 0) return { ok: true, data: step };

  try {
    const local = await loadLocalStages(workspaceId, ctx.supabase);
    const ids = page.items.map((o) => o.id);
    const contactGhlIds = [
      ...new Set(page.items.map((o) => o.contactId).filter((x): x is string => Boolean(x))),
    ];
    const [{ data: links, error: linkErr }, { data: contacts, error: contactErr }] =
      await Promise.all([
        ctx.supabase
          .from("ghl_links")
          .select("ghl_id")
          .eq("workspace_id", workspaceId)
          .eq("object", "opportunity")
          .in("ghl_id", ids),
        contactGhlIds.length
          ? ctx.supabase
              .from("contacts")
              .select("id, ghl_contact_id")
              .eq("workspace_id", workspaceId)
              .is("deleted_at", null)
              .in("ghl_contact_id", contactGhlIds)
          : Promise.resolve({
              data: [] as { id: string; ghl_contact_id: string | null }[],
              error: null,
            }),
      ]);
    if (linkErr) throw linkErr;
    if (contactErr) throw contactErr;
    const done = new Set((links ?? []).map((l) => l.ghl_id));
    const contactByGhl = new Map((contacts ?? []).map((c) => [c.ghl_contact_id, c.id]));

    // New cards go to the bottom of their stage, in GHL order.
    const { data: maxRow } = await ctx.supabase
      .from("deals")
      .select("position")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let position = (maxRow?.position ?? 0) + 1000;

    for (const o of page.items) {
      if (done.has(o.id)) {
        step.alreadyImported += 1;
        continue;
      }
      const plan = planOpportunity(o, stageMap, local);
      if (plan.action === "skip") {
        step.skipped.push({ id: o.id, name: o.name ?? null, reason: plan.reason });
        continue;
      }
      const made = await createDealFromPlan(ctx, workspaceId, o.id, plan, {
        contactId: plan.contactGhlId ? (contactByGhl.get(plan.contactGhlId) ?? null) : null,
        position,
      });
      if (!made.ok) {
        step.skipped.push({ id: o.id, name: o.name ?? null, reason: made.error });
        continue;
      }
      position += 1000;
      step.created += 1;
    }
  } catch (err) {
    return { ok: false, error: friendlyDbError(err as { code?: string; message?: string }) };
  }

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "ghl.opportunities_imported",
    entityType: "integration",
    diff: {
      fetched: step.fetched,
      created: step.created,
      already: step.alreadyImported,
      skipped: step.skipped.length,
    },
  });
  if (step.created) revalidateWorkspace();
  return { ok: true, data: step };
}
