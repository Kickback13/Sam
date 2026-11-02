"use server";

import { z } from "zod";

import { siteUrl } from "@/features/h4a/server/config";
import { toJson } from "@/lib/db/json";
import { normalizeEmail } from "@/lib/normalize";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { planNewsletter } from "../audience";
import { normalizeGatePhone } from "../compliance";
import {
  BATCH_SIZE,
  formatFrom,
  outreachEmailConfig,
  resendProvider,
  type OutgoingEmail,
} from "../email-provider";
import { defaultReason, renderNewsletter } from "../render";
import { newsletterSchema, outreachSettingsSchema, suppressionSchema } from "../schema";
import {
  gateSettings,
  getNewsletter,
  getOutreachSettings,
  loadAudienceContacts,
  loadSuppressions,
  MAX_AUDIENCE,
} from "./queries";

const ids = z.object({ workspaceId: z.uuid(), id: z.uuid() });

type DbError = { code?: string; message?: string } | null;
const dbError = (e: DbError, viewerMsg: string) =>
  e?.code === "42501"
    ? viewerMsg
    : e?.code === "P0001"
      ? (e.message ?? "Not allowed.")
      : friendlyDbError(e);

// ---------------------------------------------------------------------------
// Settings → Outreach (admins)
// ---------------------------------------------------------------------------
export async function saveOutreachSettings(input: {
  workspaceId: string;
  values: unknown;
}): Promise<ActionResult> {
  const workspaceId = z.uuid().safeParse(input.workspaceId);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  const parsed = outreachSettingsSchema.safeParse(input.values);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const before = await getOutreachSettings(workspaceId.data, ctx.supabase).catch(() => null);
  const { error } = await ctx.supabase
    .from("outreach_settings")
    .upsert({ workspace_id: workspaceId.data, ...parsed.data, updated_by: ctx.user.id });
  if (error)
    return {
      ok: false,
      error: dbError(error, "Only an owner or admin can change outreach settings."),
    };

  await writeAudit(ctx.supabase, {
    workspaceId: workspaceId.data,
    actorId: ctx.user.id,
    action: "outreach.settings_updated",
    entityType: "outreach_settings",
    diff: { before, after: parsed.data },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Newsletters
// ---------------------------------------------------------------------------
export async function createNewsletter(input: {
  workspaceId: string;
}): Promise<ActionResult<{ id: string }>> {
  const workspaceId = z.uuid().safeParse(input.workspaceId);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("newsletters")
    .insert({ workspace_id: workspaceId.data, subject: "Untitled newsletter", body: "" })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: dbError(error, "Viewers can't create newsletters.") };
  await writeAudit(ctx.supabase, {
    workspaceId: workspaceId.data,
    actorId: ctx.user.id,
    action: "newsletter.created",
    entityType: "newsletter",
    entityId: data.id,
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function saveNewsletter(input: {
  workspaceId: string;
  id: string;
  values: unknown;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = newsletterSchema.safeParse(input.values);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("newsletters")
    .update({
      subject: parsed.data.subject,
      preheader: parsed.data.preheader,
      body: parsed.data.body,
      audience: toJson(parsed.data.audience),
      updated_by: ctx.user.id,
    })
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: dbError(error, "Viewers can't edit newsletters.") };
  if (!data) return { ok: false, error: "That newsletter no longer exists." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "newsletter.updated",
    entityType: "newsletter",
    entityId: env.data.id,
    diff: { subject: parsed.data.subject, audience: parsed.data.audience },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteNewsletter(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("newsletters")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .eq("status", "draft")
    .select("id, subject");
  if (error) return { ok: false, error: dbError(error, "Viewers can't delete newsletters.") };
  if (!data?.length) return { ok: false, error: "Only drafts can be deleted." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "newsletter.deleted",
    entityType: "newsletter",
    entityId: env.data.id,
    diff: { subject: data[0].subject },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/** Same content, separate list: copy a newsletter into another workspace as a draft. */
export async function copyNewsletter(input: {
  workspaceId: string;
  id: string;
  targetWorkspaceId: string;
}): Promise<ActionResult<{ id: string }>> {
  const env = ids.extend({ targetWorkspaceId: z.uuid() }).safeParse(input);
  if (!env.success || env.data.targetWorkspaceId === env.data.workspaceId)
    return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const source = await getNewsletter(env.data.workspaceId, env.data.id, ctx.supabase);
  if (!source) return { ok: false, error: "That newsletter no longer exists." };
  const { data, error } = await ctx.supabase
    .from("newsletters")
    .insert({
      workspace_id: env.data.targetWorkspaceId,
      subject: source.subject,
      preheader: source.preheader,
      body: source.body,
      // Tags differ between workspaces; roles carry over.
      audience: toJson({ tags: [], roles: source.audience.roles, network: false }),
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: dbError(error, "You can't create newsletters in that workspace.") };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.targetWorkspaceId,
    actorId: ctx.user.id,
    action: "newsletter.copied_in",
    entityType: "newsletter",
    entityId: data.id,
    diff: { from_workspace_id: env.data.workspaceId, from_newsletter_id: env.data.id },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

// ---------------------------------------------------------------------------
// Send. Every gate is re-checked here, at send time, for every recipient.
// ---------------------------------------------------------------------------
export type SendSummary = { sent: number; failed: number; blocked: number };

export async function sendNewsletter(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult<SendSummary>> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, id } = env.data;

  const cfg = outreachEmailConfig();
  if (!cfg.enabled)
    return { ok: false, error: `Email isn't connected, so nothing was sent. ${cfg.reason}` };

  const [settings, newsletter] = await Promise.all([
    getOutreachSettings(workspaceId, ctx.supabase),
    getNewsletter(workspaceId, id, ctx.supabase),
  ]);
  if (!newsletter) return { ok: false, error: "That newsletter no longer exists." };
  if (newsletter.status !== "draft")
    return { ok: false, error: "This newsletter was already sent." };
  if (!newsletter.body.trim()) return { ok: false, error: "The newsletter is empty." };
  if (!settings.senderName || !settings.fromEmail || !settings.mailingAddress)
    return {
      ok: false,
      error: "Add the sender name, From address and mailing address in Settings → Outreach first.",
    };
  const base = siteUrl();
  if (!base)
    return { ok: false, error: "The app URL isn't known, so unsubscribe links can't be built." };

  const [contacts, suppressions, ws] = await Promise.all([
    loadAudienceContacts(workspaceId, ctx.supabase),
    loadSuppressions(workspaceId, ctx.supabase),
    ctx.supabase.from("workspaces").select("name").eq("id", workspaceId).single(),
  ]);
  if (contacts.length > MAX_AUDIENCE)
    return {
      ok: false,
      error: `More than ${MAX_AUDIENCE.toLocaleString()} contacts — narrow the audience.`,
    };
  const plan = planNewsletter(contacts, newsletter.audience, gateSettings(settings), suppressions);
  if (plan.sendable.length === 0)
    return { ok: false, error: "No one in this audience passes the checks, so nothing was sent." };

  // Claim the draft (only one send can win).
  const { data: claimed, error: claimError } = await ctx.supabase
    .from("newsletters")
    .update({ status: "sending", sent_by: ctx.user.id })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (claimError)
    return { ok: false, error: dbError(claimError, "Viewers can't send newsletters.") };
  if (!claimed?.length) return { ok: false, error: "This newsletter is already being sent." };

  // Log every recipient first: blocked ones with their reasons, the rest queued.
  const rows = plan.recipients
    .filter((r) => r.email && !r.duplicate)
    .map((r) => ({
      workspace_id: workspaceId,
      newsletter_id: id,
      contact_id: r.contactId,
      email: r.email!,
      status: r.gate.allowed ? "queued" : "blocked",
      blocked_reasons: r.gate.blocks.map((b) => b.code),
    }));
  const queued: { id: string; email: string; unsubscribe_token: string }[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await ctx.supabase
      .from("newsletter_sends")
      .insert(rows.slice(i, i + 500))
      .select("id, email, status, unsubscribe_token");
    if (error) {
      console.error("newsletter_sends insert failed", { code: error.code, message: error.message });
      return { ok: false, error: "Couldn't log the recipients, so nothing was sent." };
    }
    for (const r of data ?? []) if (r.status === "queued") queued.push(r);
  }

  const from = formatFrom(settings.senderName, settings.fromEmail);
  const reason = defaultReason(ws.data?.name ?? settings.senderName);
  const provider = resendProvider(cfg);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < queued.length; i += BATCH_SIZE) {
    const batch: OutgoingEmail[] = queued.slice(i, i + BATCH_SIZE).map((q) => {
      const unsubscribeUrl = `${base}/unsubscribe/${q.unsubscribe_token}`;
      const msg = renderNewsletter(newsletter, {
        senderName: settings.senderName!,
        mailingAddress: settings.mailingAddress!,
        reason,
        unsubscribeUrl,
      });
      return { ref: q.id, from, to: q.email, replyTo: settings.replyTo, ...msg, unsubscribeUrl };
    });
    const outcomes = await provider.sendBatch(batch);
    const now = new Date().toISOString();
    await Promise.all(
      outcomes.map((o) =>
        ctx.supabase
          .from("newsletter_sends")
          .update(
            o.ok
              ? { status: "sent", provider_message_id: o.providerId, sent_at: now }
              : { status: "failed", error: o.error.slice(0, 500) },
          )
          .eq("workspace_id", workspaceId)
          .eq("id", o.ref),
      ),
    );
    for (const o of outcomes) {
      if (o.ok) sent += 1;
      else failed += 1;
    }
  }

  const blocked = plan.recipients.filter((r) => !r.duplicate && !r.gate.allowed).length;
  const { error: finishError } = await ctx.supabase
    .from("newsletters")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: plan.matched,
      sent_count: sent,
      failed_count: failed,
      blocked_count: blocked,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (finishError) console.error("newsletter finish failed", { code: finishError.code });

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "newsletter.sent",
    entityType: "newsletter",
    entityId: id,
    diff: { sent, failed, blocked, matched: plan.matched, blocked_by: plan.summary.byCode },
  });
  revalidateWorkspace();
  return { ok: true, data: { sent, failed, blocked } };
}

// ---------------------------------------------------------------------------
// Do-not-send list
// ---------------------------------------------------------------------------
export async function addSuppression(input: {
  workspaceId: string;
  values: unknown;
  reason?: "manual" | "stop" | "unsubscribe";
  contactId?: string | null;
}): Promise<ActionResult> {
  const env = z
    .object({
      workspaceId: z.uuid(),
      reason: z.enum(["manual", "stop", "unsubscribe"]).default("manual"),
      contactId: z.uuid().nullish(),
    })
    .safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = suppressionSchema.safeParse(input.values);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const { channel, note } = parsed.data;
  const value =
    channel === "email" ? normalizeEmail(parsed.data.value) : normalizeGatePhone(parsed.data.value);
  if (!value)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: {
        value: [channel === "email" ? "Enter a valid email" : "Enter a 10-digit US phone number"],
      },
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const { data, error } = await ctx.supabase
    .from("outreach_suppressions")
    .insert({
      workspace_id: env.data.workspaceId,
      channel,
      value,
      reason: env.data.reason,
      note,
      contact_id: env.data.contactId ?? null,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { ok: true, data: undefined }; // already on the list
  if (error || !data)
    return { ok: false, error: dbError(error, "Viewers can't change the do-not-send list.") };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "outreach.suppression_added",
    entityType: "outreach_suppression",
    entityId: data.id,
    diff: { channel, value, reason: env.data.reason },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function removeSuppression(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("outreach_suppressions")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("channel, value, reason");
  if (error)
    return { ok: false, error: dbError(error, "Only an owner or admin can remove someone.") };
  if (!data?.length)
    return { ok: false, error: "Only an owner or admin can remove someone from the list." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "outreach.suppression_removed",
    entityType: "outreach_suppression",
    entityId: env.data.id,
    diff: data[0],
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
