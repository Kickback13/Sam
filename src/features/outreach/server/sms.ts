"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { checkSms } from "../compliance";
import { sendTwilioSms, SmsSendError, smsProviderConfig } from "../sms-provider";
import {
  gateSettings,
  getOutreachSettings,
  suppressionsForContact,
  toGateContact,
} from "./queries";

const ADMIN_ONLY = "Only an owner or admin can change texting.";

const settingsSchema = z
  .object({
    workspaceId: z.uuid(),
    enabled: z.boolean(),
    fromNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^\d+]/g, ""))
      .transform((v) =>
        v === "" ? null : /^\d{10}$/.test(v) ? `+1${v}` : /^1\d{10}$/.test(v) ? `+${v}` : v,
      )
      .refine(
        (v) => v === null || /^\+1[2-9]\d{9}$/.test(v),
        "Enter the US number Twilio gave you",
      ),
    messagingServiceSid: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine(
        (v) => v === null || /^MG[0-9a-f]{32}$/.test(v),
        "A Messaging Service SID starts with MG",
      ),
    helpReply: z
      .string()
      .trim()
      .max(320)
      .transform((v) => v || null),
    helpReplyEs: z
      .string()
      .trim()
      .max(320)
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => !v.enabled || v.fromNumber || v.messagingServiceSid, {
    message: "Add the sending number before switching texting on",
    path: ["fromNumber"],
  });

/** Owner/admin: texting on/off, sending number or Messaging Service, HELP / AYUDA replies. */
export async function saveSmsSettings(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const v = parsed.data;
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const created = await ctx.supabase
    .from("sms_settings")
    .upsert(
      { workspace_id: v.workspaceId },
      { onConflict: "workspace_id", ignoreDuplicates: true },
    );
  if (created.error)
    return {
      ok: false,
      error: created.error.code === "42501" ? ADMIN_ONLY : friendlyDbError(created.error),
    };
  const { data, error } = await ctx.supabase
    .from("sms_settings")
    .update({
      enabled: v.enabled,
      from_number: v.fromNumber,
      messaging_service_sid: v.messagingServiceSid,
      help_reply: v.helpReply,
      help_reply_es: v.helpReplyEs,
      updated_by: ctx.user.id,
    })
    .eq("workspace_id", v.workspaceId)
    .select("workspace_id");
  if (error)
    return { ok: false, error: error.code === "42501" ? ADMIN_ONLY : friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: ADMIN_ONLY };
  await writeAudit(ctx.supabase, {
    workspaceId: v.workspaceId,
    actorId: ctx.user.id,
    action: "sms.settings_saved",
    entityType: "sms",
    diff: { enabled: v.enabled, has_number: Boolean(v.fromNumber || v.messagingServiceSid) },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/** Owner/admin: new webhook link for Twilio (the old one stops working). Shown once. */
export async function createSmsWebhookToken(input: {
  workspaceId: string;
}): Promise<ActionResult<{ token: string }>> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("sms_create_token", { p_workspace_id: ws.data });
  if (error || !data)
    return { ok: false, error: error?.code === "42501" ? ADMIN_ONLY : friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: { token: data } };
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const sendSchema = z.object({
  workspaceId: z.uuid(),
  contactId: z.uuid(),
  body: z.string().trim().min(1, "Write a message").max(1600, "Keep it under 1,600 characters"),
});

export type SendSmsResult = { status: "sent" };

/**
 * A person sends one text to one contact. Order matters:
 *   1. the TCPA gates in the app (to explain a block in plain words; blocked attempts are logged),
 *   2. the database guard re-checks every gate when the message is queued (the authority),
 *   3. only then is Twilio called, and its answer recorded.
 */
export async function sendSms(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult<SendSmsResult>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the message",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const { workspaceId, contactId, body } = parsed.data;
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const cfg = smsProviderConfig();
  if (!cfg.connected)
    return { ok: false, error: "Texting isn't connected yet (Twilio account not set up)." };
  const { data: settings } = await ctx.supabase
    .from("sms_settings")
    .select("enabled, from_number, messaging_service_sid")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!settings?.enabled)
    return { ok: false, error: "Texting is switched off. An owner or admin can turn it on." };

  const { data: contact, error: cErr } = await ctx.supabase
    .from("contacts")
    .select("id, dnc, sms_consent, sms_consent_at, email_opt_out, emails, phones")
    .eq("workspace_id", workspaceId)
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cErr) return { ok: false, error: friendlyDbError(cErr) };
  if (!contact) return { ok: false, error: "Contact not found." };

  const gc = toGateContact(contact);
  const [outreach, suppressions] = await Promise.all([
    getOutreachSettings(workspaceId, ctx.supabase),
    suppressionsForContact(workspaceId, gc),
  ]);
  const gate = checkSms(gc, gateSettings(outreach), suppressions, "informational", new Date());
  if (!gate.allowed) {
    if (gate.to)
      await ctx.supabase.from("sms_messages").insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        direction: "out",
        status: "blocked",
        to_number: gate.to,
        body,
        blocks: toJson(gate.blocks),
        sent_by: ctx.user.id,
      });
    return { ok: false, error: `Not sent: ${gate.blocks.map((b) => b.message).join("; ")}.` };
  }

  const { data: queued, error: qErr } = await ctx.supabase
    .from("sms_messages")
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      direction: "out",
      status: "queued",
      to_number: gate.to!,
      body,
      sent_by: ctx.user.id,
    })
    .select("id, from_number")
    .single();
  if (qErr)
    return {
      ok: false,
      error: ["PT403", "PT429"].includes(qErr.code ?? "") ? qErr.message : friendlyDbError(qErr),
    };

  try {
    const r = await sendTwilioSms(cfg, {
      to: gate.to!,
      body,
      from: queued.from_number,
      messagingServiceSid: settings.messaging_service_sid,
      statusCallback: `${await origin()}/api/sms/status`,
    });
    await ctx.supabase
      .from("sms_messages")
      .update({ status: "sent", provider_sid: r.sid })
      .eq("id", queued.id);
  } catch (err) {
    const message = err instanceof SmsSendError ? err.message : "Twilio couldn't send it.";
    await ctx.supabase
      .from("sms_messages")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", queued.id);
    revalidateWorkspace();
    return { ok: false, error: message };
  }

  const { error: aErr } = await ctx.supabase.from("activities").insert({
    workspace_id: workspaceId,
    type: "sms",
    subject_type: "contact",
    subject_id: contactId,
    body: `Text sent: ${body}`,
    metadata: toJson({ direction: "out", message_id: queued.id }),
    created_by: ctx.user.id,
  });
  if (aErr) console.error("sms activity insert failed", { code: aErr.code });
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "sms.sent",
    entityType: "contact",
    entityId: contactId,
    diff: { message_id: queued.id },
  });
  revalidateWorkspace();
  return { ok: true, data: { status: "sent" } };
}
