"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { alertEmailConfig } from "../../alerts/email";
import { transformListingRow, type ListingColumnMapping } from "../../csv/mapping";
import { planListingRows, type ExistingListing } from "../../listing/dedupe";
import { ingestAndScore, itemFromFields } from "../../pipeline/pipeline";
import type { IngestItem } from "../../pipeline/types";
import { sessionStore, StoreError } from "../stores";

const MAX_ROWS = 10_000;
const MAX_CHUNK = 250;
const MAX_STORED_ERRORS = 2_000;

const keysRow = z.object({
  row: z.number().int().positive(),
  apnKey: z.string().max(20).nullable(),
  matchKeys: z.array(z.string().max(320)).max(10),
});

export type ListingDuplicateCheck = {
  row: number;
  action: "create" | "update" | "duplicate_in_file";
  existingId?: string;
  existingAddress?: string;
  firstRow?: number;
};

/** Preview: how each row would dedupe against listings already in the workspace. */
export async function checkListingImport(input: {
  workspaceId: string;
  rows: z.input<typeof keysRow>[];
}): Promise<ActionResult<ListingDuplicateCheck[]>> {
  const parsed = z
    .object({ workspaceId: z.uuid(), rows: z.array(keysRow).max(MAX_ROWS) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preview request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, rows } = parsed.data;

  const existing = new Map<string, ExistingListing>();
  const keys = [...new Set(rows.flatMap((r) => r.matchKeys))];
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await ctx.supabase
      .from("h4a_listings")
      .select("id, address, apn_key, match_keys")
      .eq("workspace_id", workspaceId)
      .overlaps("match_keys", keys.slice(i, i + 200));
    if (error) return { ok: false, error: friendlyDbError(error) };
    for (const l of data ?? [])
      existing.set(l.id, {
        id: l.id,
        address: l.address,
        apnKey: l.apn_key,
        matchKeys: l.match_keys,
      });
  }
  const apns = [...new Set(rows.map((r) => r.apnKey).filter((v): v is string => Boolean(v)))];
  for (let i = 0; i < apns.length; i += 200) {
    const { data } = await ctx.supabase
      .from("h4a_listings")
      .select("id, address, apn_key, match_keys")
      .eq("workspace_id", workspaceId)
      .in("apn_key", apns.slice(i, i + 200));
    for (const l of data ?? [])
      existing.set(l.id, {
        id: l.id,
        address: l.address,
        apnKey: l.apn_key,
        matchKeys: l.match_keys,
      });
  }
  const plans = planListingRows(rows, [...existing.values()]);
  return {
    ok: true,
    data: rows.map((r) => {
      const p = plans.get(r.row)!;
      if (p.action === "update")
        return {
          row: r.row,
          action: "update",
          existingId: p.existingId,
          existingAddress: p.existingAddress,
        };
      if (p.action === "duplicate_in_file")
        return { row: r.row, action: "duplicate_in_file", firstRow: p.firstRow };
      return { row: r.row, action: "create" };
    }),
  };
}

const startSchema = z.object({
  workspaceId: z.uuid(),
  filename: z.string().max(255),
  mapping: z.record(z.string().max(200), z.string().max(40)),
  totalRows: z.number().int().min(1).max(MAX_ROWS),
});

export async function startListingImport(
  input: z.input<typeof startSchema>,
): Promise<ActionResult<{ importId: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid import settings" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_imports")
    .insert({
      workspace_id: parsed.data.workspaceId,
      filename: parsed.data.filename,
      mapping: toJson(parsed.data.mapping),
      total_rows: parsed.data.totalRows,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: { importId: data.id } };
}

export type ListingChunkResult = {
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
  /** Listing id per row that was saved (for links in the result). */
  saved: { row: number; id: string; action: string }[];
};

const chunkSchema = z.object({
  workspaceId: z.uuid(),
  importId: z.uuid(),
  rows: z
    .array(
      z.object({
        row: z.number().int().positive(),
        raw: z.record(z.string().max(200), z.string().max(5000).optional()),
      }),
    )
    .min(1)
    .max(MAX_CHUNK),
});

/** Re-validate rows on the server, skip in-file duplicates, ingest + score the rest. */
export async function importListingChunk(
  input: z.input<typeof chunkSchema>,
): Promise<ActionResult<ListingChunkResult>> {
  const parsed = chunkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid import chunk" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, importId, rows } = parsed.data;

  const { data: job } = await ctx.supabase
    .from("h4a_imports")
    .select(
      "id, status, filename, mapping, created_count, updated_count, unchanged_count, error_count, errors",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", importId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Import not found." };
  if (job.status !== "processing") return { ok: false, error: "This import is already finished." };

  const mapping = (job.mapping ?? {}) as ListingColumnMapping;
  const result: ListingChunkResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    saved: [],
  };
  const label = `CSV: ${job.filename ?? "upload"}`.slice(0, 120);
  const fetchedAt = new Date().toISOString();

  const items: { row: number; item: IngestItem }[] = [];
  for (const r of rows) {
    const t = transformListingRow(r.raw, mapping);
    if (!t.ok) {
      result.errors.push({ row: r.row, message: t.errors.join("; ") });
      continue;
    }
    items.push({
      row: r.row,
      item: itemFromFields(t.fields, "csv", { label, fetched_at: fetchedAt }),
    });
  }
  // Same building twice in this chunk: keep the first, report the rest (like the contact importer).
  const plans = planListingRows(
    items.map((i) => ({
      row: i.row,
      apnKey: i.item.keys.apn_key,
      matchKeys: i.item.keys.match_keys,
    })),
    [],
  );
  const toIngest = items.filter((i) => {
    const p = plans.get(i.row);
    if (p?.action === "duplicate_in_file") {
      result.errors.push({
        row: i.row,
        message: `Skipped: same building as row ${p.firstRow} in this file`,
      });
      return false;
    }
    return true;
  });

  try {
    const out = await ingestAndScore(
      sessionStore(ctx.supabase, workspaceId),
      toIngest.map((i) => i.item),
      alertEmailConfig(),
    );
    for (const r of out.results) {
      const row = toIngest[r.index].row;
      if (r.action === "error") {
        result.errors.push({ row, message: friendlyDbError({ code: r.code, message: r.error }) });
        continue;
      }
      result[r.action]++;
      result.saved.push({ row, id: r.listing_id, action: r.action });
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof StoreError
          ? friendlyDbError({ code: e.code, message: e.message })
          : "Import failed.",
    };
  }

  const rawByRow = new Map(rows.map((r) => [r.row, r.raw]));
  const stored = [
    ...((job.errors as unknown[]) ?? []),
    ...result.errors.map((e) => ({ ...e, data: rawByRow.get(e.row) ?? {} })),
  ].slice(0, MAX_STORED_ERRORS);
  await ctx.supabase
    .from("h4a_imports")
    .update({
      created_count: job.created_count + result.created,
      updated_count: job.updated_count + result.updated,
      unchanged_count: job.unchanged_count + result.unchanged,
      error_count:
        job.error_count + result.errors.filter((e) => !e.message.startsWith("Skipped:")).length,
      errors: toJson(stored),
    })
    .eq("id", importId)
    .eq("workspace_id", workspaceId);
  return { ok: true, data: result };
}

export async function finishListingImport(input: {
  workspaceId: string;
  importId: string;
  failed?: boolean;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workspaceId: z.uuid(), importId: z.uuid(), failed: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_imports")
    .update({
      status: parsed.data.failed ? "failed" : "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.importId)
    .eq("workspace_id", parsed.data.workspaceId)
    .select("filename, total_rows, created_count, updated_count, unchanged_count, error_count")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: parsed.data.failed ? "listing_import.failed" : "listing_import.completed",
    entityType: "listing_import",
    entityId: parsed.data.importId,
    diff: data,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
