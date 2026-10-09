"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { tagsSchema, zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import {
  bulkContactsSchema,
  contactInputSchema,
  type ContactInput,
} from "@/lib/validation/contact";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

export type DuplicateMatch = { id: string; name: string | null };

function toRow(
  c: ContactInput,
  existing?: {
    sms_consent: string;
    sms_consent_at: string | null;
    email_opt_out: boolean;
    email_opt_out_at: string | null;
  },
) {
  const now = new Date().toISOString();
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    title: c.title,
    company_id: c.company_id,
    roles: c.roles,
    emails: toJson(c.emails.map((e) => ({ ...e, value: normalizeEmail(e.value) ?? e.value }))),
    phones: toJson(c.phones),
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    source: c.source,
    tags: c.tags,
    assigned_to: c.assigned_to,
    language: c.language,
    dnc: c.dnc,
    sms_consent: c.sms_consent,
    // Keep the original consent timestamp unless the consent level changes.
    sms_consent_at:
      c.sms_consent === "none"
        ? null
        : existing && existing.sms_consent === c.sms_consent && existing.sms_consent_at
          ? existing.sms_consent_at
          : now,
    sms_consent_source: c.sms_consent === "none" ? null : c.sms_consent_source,
    email_opt_out: c.email_opt_out,
    email_opt_out_at: c.email_opt_out
      ? existing?.email_opt_out
        ? existing.email_opt_out_at
        : now
      : null,
    notes: c.notes,
  };
}

async function findDuplicates(
  supabase: NonNullable<Awaited<ReturnType<typeof actionContext>>>["supabase"],
  workspaceId: string,
  c: ContactInput,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const emailKeys = c.emails
    .map((e) => normalizeEmail(e.value))
    .filter((v): v is string => Boolean(v));
  const phoneKeys = c.phones
    .map((p) => normalizePhone(p.value))
    .filter((v): v is string => Boolean(v));
  if (!emailKeys.length && !phoneKeys.length) return [];
  const { data } = await supabase.rpc("find_contact_duplicates", {
    p_workspace_id: workspaceId,
    p_email_keys: emailKeys,
    p_phone_keys: phoneKeys,
  });
  return (data ?? [])
    .filter((d) => d.id !== excludeId)
    .map((d) => ({ id: d.id, name: d.full_name }));
}

const createSchema = z.object({
  workspaceId: z.uuid(),
  contact: z.unknown(),
  allowDuplicate: z.boolean().default(false),
});

export async function createContact(
  input: z.input<typeof createSchema>,
): Promise<
  ActionResult<{ id: string }> | { ok: false; error: string; duplicates: DuplicateMatch[] }
> {
  const envelope = createSchema.safeParse(input);
  if (!envelope.success) return { ok: false, error: "Invalid request" };
  const parsed = contactInputSchema.safeParse(envelope.data.contact);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, allowDuplicate } = envelope.data;

  if (!allowDuplicate) {
    const duplicates = await findDuplicates(ctx.supabase, workspaceId, parsed.data);
    if (duplicates.length)
      return { ok: false, error: "A contact with this email or phone already exists.", duplicates };
  }

  const row = toRow(parsed.data);
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({ ...row, workspace_id: workspaceId, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "contact.create",
    entityType: "contact",
    entityId: data.id,
    diff: diffFields(null, row as Record<string, unknown>),
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

const updateSchema = z.object({ workspaceId: z.uuid(), contactId: z.uuid(), contact: z.unknown() });

export async function updateContact(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<{ id: string }>> {
  const envelope = updateSchema.safeParse(input);
  if (!envelope.success) return { ok: false, error: "Invalid request" };
  const parsed = contactInputSchema.safeParse(envelope.data.contact);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, contactId } = envelope.data;

  const { data: before, error: readError } = await ctx.supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", contactId)
    .maybeSingle();
  if (readError || !before) return { ok: false, error: "Contact not found." };

  const row = toRow(parsed.data, before);
  const { data, error } = await ctx.supabase
    .from("contacts")
    .update(row)
    .eq("workspace_id", workspaceId)
    .eq("id", contactId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't edit contacts in this workspace." };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "contact.update",
    entityType: "contact",
    entityId: contactId,
    diff: diffFields(
      before as Record<string, unknown>,
      row as Record<string, unknown>,
      Object.keys(row),
    ),
  });
  revalidateWorkspace();
  return { ok: true, data: { id: contactId } };
}

export async function deleteContacts(
  input: z.input<typeof bulkContactsSchema>,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkContactsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, contactIds } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("id", contactIds)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "contact.delete",
    entityType: "contact",
    entityId: contactIds.length === 1 ? contactIds[0] : null,
    diff: { contact_ids: contactIds, soft_delete: true },
  });
  revalidateWorkspace();
  return { ok: true, data: { count: data?.length ?? 0 } };
}

const bulkTagSchema = bulkContactsSchema.extend({ add: tagsSchema, remove: tagsSchema });

export async function bulkTagContacts(
  input: z.input<typeof bulkTagSchema>,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkTagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter at least one tag" };
  if (!parsed.data.add.length && !parsed.data.remove.length)
    return { ok: false, error: "Enter at least one tag" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, contactIds, add, remove } = parsed.data;

  const { data, error } = await ctx.supabase.rpc("contacts_bulk_tag", {
    p_workspace_id: workspaceId,
    p_contact_ids: contactIds,
    p_add: add,
    p_remove: remove,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "contact.bulk_tag",
    entityType: "contact",
    diff: { contact_ids: contactIds, add, remove },
  });
  revalidateWorkspace();
  return { ok: true, data: { count: data ?? 0 } };
}

const bulkAssignSchema = bulkContactsSchema.extend({ assignedTo: z.uuid().nullable() });

export async function bulkAssignContacts(
  input: z.input<typeof bulkAssignSchema>,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkAssignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, contactIds, assignedTo } = parsed.data;

  if (assignedTo) {
    const { data: member } = await ctx.supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", assignedTo)
      .maybeSingle();
    if (!member) return { ok: false, error: "That person isn't a member of this workspace." };
  }

  const { data, error } = await ctx.supabase
    .from("contacts")
    .update({ assigned_to: assignedTo })
    .eq("workspace_id", workspaceId)
    .in("id", contactIds)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "contact.bulk_assign",
    entityType: "contact",
    diff: { contact_ids: contactIds, assigned_to: assignedTo },
  });
  revalidateWorkspace();
  return { ok: true, data: { count: data?.length ?? 0 } };
}
