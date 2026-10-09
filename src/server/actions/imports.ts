"use server";

import { z } from "zod";

import { mergeContact, planRows, type ExistingContact } from "@/lib/csv/dedupe";
import type { ColumnMapping } from "@/lib/csv/mapping";
import { transformRow, type MappedRow } from "@/lib/csv/transform";
import { toJson } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import { normalizeEmail } from "@/lib/normalize";
import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace, type ActionContext } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

const MAX_ROWS = 20_000;
const MAX_CHUNK = 500;
const MAX_STORED_ERRORS = 2_000;

const keysRowSchema = z.object({
  row: z.number().int().positive(),
  emailKeys: z.array(z.string().max(254)).max(20),
  phoneKeys: z.array(z.string().max(20)).max(20),
  ghlContactId: z.string().max(100).nullable().optional(),
});

async function fetchExisting(
  ctx: ActionContext,
  workspaceId: string,
  emailKeys: string[],
  phoneKeys: string[],
  ghlIds: string[],
): Promise<ExistingContact[]> {
  const out = new Map<string, ExistingContact>();
  // Batch to keep request URLs/bodies reasonable.
  const batch = 1000;
  for (let i = 0; i < Math.max(emailKeys.length, phoneKeys.length, 1); i += batch) {
    const e = emailKeys.slice(i, i + batch);
    const p = phoneKeys.slice(i, i + batch);
    if (!e.length && !p.length) break;
    const { data, error } = await ctx.supabase.rpc("find_contact_duplicates", {
      p_workspace_id: workspaceId,
      p_email_keys: e,
      p_phone_keys: p,
    });
    if (error) throw error;
    for (const d of data ?? []) out.set(d.id, { id: d.id, full_name: d.full_name, emailKeys: d.email_keys, phoneKeys: d.phone_keys });
  }
  for (let i = 0; i < ghlIds.length; i += batch) {
    const { data, error } = await ctx.supabase
      .from("contacts")
      .select("id, full_name, email_keys, phone_keys, ghl_contact_id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("ghl_contact_id", ghlIds.slice(i, i + batch));
    if (error) throw error;
    for (const d of data ?? [])
      out.set(d.id, { id: d.id, full_name: d.full_name, emailKeys: d.email_keys, phoneKeys: d.phone_keys, ghlContactId: d.ghl_contact_id });
  }
  return [...out.values()];
}

export type DuplicateCheck = {
  row: number;
  action: "create" | "match" | "duplicate_in_file";
  existingId?: string;
  existingName?: string | null;
  firstRow?: number;
  via?: string;
};

/** Preview step: how each (already client-validated) row would dedupe against the workspace. */
export async function checkImportDuplicates(input: {
  workspaceId: string;
  rows: z.input<typeof keysRowSchema>[];
}): Promise<ActionResult<DuplicateCheck[]>> {
  const parsed = z.object({ workspaceId: z.uuid(), rows: z.array(keysRowSchema).max(MAX_ROWS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preview request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, rows } = parsed.data;

  const emailKeys = [...new Set(rows.flatMap((r) => r.emailKeys))];
  const phoneKeys = [...new Set(rows.flatMap((r) => r.phoneKeys))];
  const ghlIds = [...new Set(rows.map((r) => r.ghlContactId).filter((v): v is string => Boolean(v)))];
  try {
    const existing = await fetchExisting(ctx, workspaceId, emailKeys, phoneKeys, ghlIds);
    const plans = planRows(rows, existing);
    return {
      ok: true,
      data: rows.map((r) => {
        const plan = plans.get(r.row)!;
        if (plan.action === "match") return { row: r.row, action: "match", existingId: plan.existingId, existingName: plan.existingName, via: plan.via };
        if (plan.action === "duplicate_in_file") return { row: r.row, action: "duplicate_in_file", firstRow: plan.firstRow, via: plan.via };
        return { row: r.row, action: "create" };
      }),
    };
  } catch (error) {
    return { ok: false, error: friendlyDbError(error as { code?: string; message?: string }) };
  }
}

const startSchema = z.object({
  workspaceId: z.uuid(),
  filename: z.string().max(255),
  mapping: z.record(z.string().max(200), z.string().max(40)),
  dedupeStrategy: z.enum(["skip", "update"]),
  totalRows: z.number().int().min(1).max(MAX_ROWS),
  extraTags: z.array(z.string().max(50)).max(5).default([]),
  defaultSource: z.string().max(100).default("CSV import"),
});

export async function startImport(input: z.input<typeof startSchema>): Promise<ActionResult<{ importId: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid import settings" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const s = parsed.data;
  const { data, error } = await ctx.supabase
    .from("imports")
    .insert({
      workspace_id: s.workspaceId,
      entity: "contacts",
      filename: s.filename,
      status: "processing",
      dedupe_strategy: s.dedupeStrategy,
      mapping: toJson({ columns: s.mapping, extraTags: s.extraTags, defaultSource: s.defaultSource }),
      total_rows: s.totalRows,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: { importId: data.id } };
}

export type ChunkResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const chunkSchema = z.object({
  workspaceId: z.uuid(),
  importId: z.uuid(),
  rows: z
    .array(z.object({ row: z.number().int().positive(), raw: z.record(z.string().max(200), z.string().max(5000).optional()) }))
    .min(1)
    .max(MAX_CHUNK),
});

type ContactInsert = ReturnType<typeof toInsert>;

function toInsert(m: MappedRow, workspaceId: string, userId: string, extraTags: string[]) {
  const c = m.contact;
  return {
    workspace_id: workspaceId,
    created_by: userId,
    first_name: c.first_name,
    last_name: c.last_name,
    title: c.title,
    roles: c.roles,
    emails: toJson(c.emails.map((e) => ({ ...e, value: normalizeEmail(e.value) ?? e.value }))),
    phones: toJson(c.phones),
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    source: c.source,
    tags: [...new Set([...c.tags, ...extraTags])],
    language: c.language,
    dnc: c.dnc,
    email_opt_out: c.email_opt_out,
    email_opt_out_at: c.email_opt_out ? new Date().toISOString() : null,
    notes: c.notes,
    ghl_contact_id: m.ghlContactId,
    company_id: null as string | null,
  };
}

export async function importChunk(input: z.input<typeof chunkSchema>): Promise<ActionResult<ChunkResult>> {
  const parsed = chunkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid import chunk" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, importId, rows } = parsed.data;

  const { data: job, error: jobError } = await ctx.supabase
    .from("imports")
    .select("id, status, dedupe_strategy, mapping, created_count, updated_count, skipped_count, error_count, errors")
    .eq("workspace_id", workspaceId)
    .eq("id", importId)
    .maybeSingle();
  if (jobError || !job) return { ok: false, error: "Import not found." };
  if (job.status !== "processing") return { ok: false, error: "This import is already finished." };

  const settings = (job.mapping ?? {}) as { columns?: ColumnMapping; extraTags?: string[]; defaultSource?: string };
  const mapping = settings.columns ?? {};
  const extraTags = settings.extraTags ?? [];
  const result: ChunkResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // 1) Validate every row on the server (the client preview is advisory only).
  const valid: { row: number; mapped: MappedRow; raw: Record<string, string | undefined> }[] = [];
  for (const r of rows) {
    const t = transformRow(r.raw, mapping, { source: settings.defaultSource });
    if (t.ok) valid.push({ row: r.row, mapped: t.value, raw: r.raw });
    else result.errors.push({ row: r.row, message: t.errors.join("; ") });
  }

  try {
    // 2) Dedupe against the workspace and within this chunk.
    const existing = await fetchExisting(
      ctx,
      workspaceId,
      [...new Set(valid.flatMap((v) => v.mapped.emailKeys))],
      [...new Set(valid.flatMap((v) => v.mapped.phoneKeys))],
      [...new Set(valid.map((v) => v.mapped.ghlContactId).filter((x): x is string => Boolean(x)))],
    );
    const plans = planRows(
      valid.map((v) => ({ row: v.row, emailKeys: v.mapped.emailKeys, phoneKeys: v.mapped.phoneKeys, ghlContactId: v.mapped.ghlContactId })),
      existing,
    );

    // 3) Resolve companies by name (case-insensitive), creating missing ones.
    const companyNames = [...new Set(valid.map((v) => v.mapped.companyName).filter((n): n is string => Boolean(n)))];
    const companyIds = new Map<string, string>();
    if (companyNames.length) {
      const { data: companies } = await ctx.supabase
        .from("companies")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .limit(10_000);
      for (const co of companies ?? []) companyIds.set(co.name.toLowerCase(), co.id);
      const missing = companyNames.filter((n) => !companyIds.has(n.toLowerCase()));
      if (missing.length) {
        const { data: created, error } = await ctx.supabase
          .from("companies")
          .insert(missing.map((name) => ({ workspace_id: workspaceId, name: name.slice(0, 200), created_by: ctx.user.id })))
          .select("id, name");
        if (error) throw error;
        for (const co of created ?? []) companyIds.set(co.name.toLowerCase(), co.id);
      }
    }

    // 4) Creates (bulk, with per-row fallback so one bad row can't sink the chunk).
    const creates: { row: number; insert: ContactInsert }[] = [];
    const updates: { row: number; existingId: string; mapped: MappedRow }[] = [];
    for (const v of valid) {
      const plan = plans.get(v.row)!;
      const insert = toInsert(v.mapped, workspaceId, ctx.user.id, extraTags);
      insert.company_id = v.mapped.companyName ? (companyIds.get(v.mapped.companyName.toLowerCase()) ?? null) : null;
      if (plan.action === "create") creates.push({ row: v.row, insert });
      else if (plan.action === "duplicate_in_file") {
        result.skipped++;
        result.errors.push({ row: v.row, message: `Skipped: duplicate of row ${plan.firstRow} in this file (${plan.via})` });
      } else if (job.dedupe_strategy === "update") updates.push({ row: v.row, existingId: plan.existingId, mapped: v.mapped });
      else result.skipped++;
    }

    if (creates.length) {
      const { error } = await ctx.supabase.from("contacts").insert(creates.map((c) => c.insert));
      if (!error) result.created += creates.length;
      else {
        for (const c of creates) {
          const { error: rowError } = await ctx.supabase.from("contacts").insert(c.insert);
          if (rowError) result.errors.push({ row: c.row, message: friendlyDbError(rowError) });
          else result.created++;
        }
      }
    }

    // 5) Updates: merge incoming values into the matched contact.
    if (updates.length) {
      const { data: current } = await ctx.supabase
        .from("contacts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("id", [...new Set(updates.map((u) => u.existingId))]);
      const byId = new Map((current ?? []).map((c) => [c.id, c]));
      for (const u of updates) {
        const before = byId.get(u.existingId);
        if (!before) {
          result.errors.push({ row: u.row, message: "Matched contact no longer exists" });
          continue;
        }
        const incoming = toInsert(u.mapped, workspaceId, ctx.user.id, extraTags);
        incoming.company_id = u.mapped.companyName ? (companyIds.get(u.mapped.companyName.toLowerCase()) ?? null) : null;
        const { workspace_id: _w, created_by: _c, ...fields } = incoming;
        void _w;
        void _c;
        const patch = mergeContact(
          before as unknown as Record<string, unknown>,
          fields as unknown as Record<string, unknown>,
        ) as Database["public"]["Tables"]["contacts"]["Update"];
        if (before.ghl_contact_id && patch.ghl_contact_id && patch.ghl_contact_id !== before.ghl_contact_id) delete patch.ghl_contact_id;
        const { error } = await ctx.supabase.from("contacts").update(patch).eq("id", u.existingId).eq("workspace_id", workspaceId);
        if (error) result.errors.push({ row: u.row, message: friendlyDbError(error) });
        else {
          result.updated++;
          byId.set(u.existingId, { ...before, ...(patch as object) });
        }
      }
    }
  } catch (error) {
    return { ok: false, error: friendlyDbError(error as { code?: string; message?: string }) };
  }

  // 6) Persist progress + capped error list (with the raw row for the report).
  const rawByRow = new Map(rows.map((r) => [r.row, r.raw]));
  const storedErrors = [
    ...((job.errors as unknown[]) ?? []),
    ...result.errors.map((e) => ({ ...e, data: rawByRow.get(e.row) ?? {} })),
  ].slice(0, MAX_STORED_ERRORS);
  const hardErrors = result.errors.filter((e) => !e.message.startsWith("Skipped:")).length;
  await ctx.supabase
    .from("imports")
    .update({
      created_count: job.created_count + result.created,
      updated_count: job.updated_count + result.updated,
      skipped_count: job.skipped_count + result.skipped,
      error_count: job.error_count + hardErrors,
      errors: toJson(storedErrors),
    })
    .eq("id", importId)
    .eq("workspace_id", workspaceId);

  return { ok: true, data: result };
}

export async function finishImport(input: { workspaceId: string; importId: string; failed?: boolean }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), importId: z.uuid(), failed: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("imports")
    .update({ status: parsed.data.failed ? "failed" : "completed", completed_at: new Date().toISOString() })
    .eq("id", parsed.data.importId)
    .eq("workspace_id", parsed.data.workspaceId)
    .select("filename, total_rows, created_count, updated_count, skipped_count, error_count")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: parsed.data.failed ? "import.failed" : "import.completed",
    entityType: "import",
    entityId: parsed.data.importId,
    diff: data,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
