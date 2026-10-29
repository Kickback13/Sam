import "server-only";

import { createClient, type ServerSupabase } from "@/lib/supabase/server";

import type { AudienceContact } from "../audience";
import {
  DEFAULT_SEND_FROM,
  DEFAULT_SEND_UNTIL,
  DEFAULT_TIME_ZONE,
  normalizeGatePhone,
  type GateContact,
  type GateSettings,
  type SmsConsent,
  type Suppressions,
} from "../compliance";
import { parseAudience, type Audience } from "../schema";

export type OutreachSettings = {
  senderName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  mailingAddress: string | null;
  timeZone: string;
  smsSendFrom: number;
  smsSendUntil: number;
  updatedAt: string | null;
};

export const EMPTY_SETTINGS: OutreachSettings = {
  senderName: null,
  fromEmail: null,
  replyTo: null,
  mailingAddress: null,
  timeZone: DEFAULT_TIME_ZONE,
  smsSendFrom: DEFAULT_SEND_FROM,
  smsSendUntil: DEFAULT_SEND_UNTIL,
  updatedAt: null,
};

export function gateSettings(s: OutreachSettings): GateSettings {
  return {
    senderName: s.senderName,
    mailingAddress: s.mailingAddress,
    timeZone: s.timeZone,
    sendFrom: s.smsSendFrom,
    sendUntil: s.smsSendUntil,
  };
}

export async function getOutreachSettings(
  workspaceId: string,
  supabase?: ServerSupabase,
): Promise<OutreachSettings> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("outreach_settings")
    .select(
      "sender_name, from_email, reply_to, mailing_address, time_zone, sms_send_from, sms_send_until, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_SETTINGS;
  return {
    senderName: data.sender_name,
    fromEmail: data.from_email,
    replyTo: data.reply_to,
    mailingAddress: data.mailing_address,
    timeZone: data.time_zone,
    smsSendFrom: data.sms_send_from,
    smsSendUntil: data.sms_send_until,
    updatedAt: data.updated_at,
  };
}

export async function loadSuppressions(
  workspaceId: string,
  supabase?: ServerSupabase,
): Promise<Suppressions> {
  const db = supabase ?? (await createClient());
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("outreach_suppressions")
      .select("channel, value")
      .eq("workspace_id", workspaceId)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) (r.channel === "email" ? emails : phones).add(r.value);
    if (!data || data.length < 1000) break;
  }
  return { emails, phones };
}

type ContactRow = {
  id: string;
  full_name: string | null;
  emails: unknown;
  phones: unknown;
  tags: string[];
  roles: string[];
  dnc: boolean;
  sms_consent: SmsConsent;
  sms_consent_at: string | null;
  email_opt_out: boolean;
};

const CONTACT_COLS =
  "id, full_name, emails, phones, tags, roles, dnc, sms_consent, sms_consent_at, email_opt_out";

function asList<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function toGateContact(
  r: Omit<ContactRow, "id" | "full_name" | "tags" | "roles">,
): GateContact {
  return {
    dnc: r.dnc,
    smsConsent: r.sms_consent,
    smsConsentAt: r.sms_consent_at,
    emailOptOut: r.email_opt_out,
    emails: asList<{ value?: unknown; is_primary?: boolean }>(r.emails)
      .filter((e) => typeof e?.value === "string")
      .map((e) => ({ value: e.value as string, is_primary: Boolean(e.is_primary) })),
    phones: asList<{ value?: unknown; type?: unknown; is_primary?: boolean }>(r.phones)
      .filter((p) => typeof p?.value === "string")
      .map((p) => ({
        value: p.value as string,
        type: typeof p.type === "string" ? p.type : "unknown",
        is_primary: Boolean(p.is_primary),
      })),
  };
}

/** Hard cap per send in 4A (one server action, batches of 100). */
export const MAX_AUDIENCE = 5000;

/** Every live contact in the workspace (up to MAX_AUDIENCE + 1, so callers can tell it overflowed). */
export async function loadAudienceContacts(
  workspaceId: string,
  supabase?: ServerSupabase,
): Promise<AudienceContact[]> {
  const db = supabase ?? (await createClient());
  const out: AudienceContact[] = [];
  // Contacts linked to active Network members (for the "Only Network members" audience).
  const { data: net, error: netErr } = await db
    .from("network_members")
    .select("contact_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .not("contact_id", "is", null)
    .limit(10_000);
  if (netErr) throw netErr;
  const networkContacts = new Set((net ?? []).map((m) => m.contact_id));
  for (let from = 0; from <= MAX_AUDIENCE; from += 1000) {
    const { data, error } = await db
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as ContactRow[])
      out.push({
        ...toGateContact(r),
        id: r.id,
        name: r.full_name ?? "(no name)",
        tags: r.tags,
        roles: r.roles,
        networkMember: networkContacts.has(r.id),
      });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type NewsletterRow = {
  id: string;
  subject: string;
  preheader: string | null;
  body: string;
  audience: Audience;
  status: "draft" | "sending" | "sent";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  sentAt: string | null;
  updatedAt: string;
  createdAt: string;
};

const NEWSLETTER_COLS =
  "id, subject, preheader, body, audience, status, recipient_count, sent_count, failed_count, blocked_count, sent_at, updated_at, created_at";

type RawNewsletter = {
  id: string;
  subject: string;
  preheader: string | null;
  body: string;
  audience: unknown;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  blocked_count: number;
  sent_at: string | null;
  updated_at: string;
  created_at: string;
};

function toNewsletter(r: RawNewsletter): NewsletterRow {
  return {
    id: r.id,
    subject: r.subject,
    preheader: r.preheader,
    body: r.body,
    audience: parseAudience(r.audience),
    status: r.status as NewsletterRow["status"],
    recipientCount: r.recipient_count,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    blockedCount: r.blocked_count,
    sentAt: r.sent_at,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

export async function listNewsletters(workspaceId: string): Promise<NewsletterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .select(NEWSLETTER_COLS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(toNewsletter);
}

export async function getNewsletter(
  workspaceId: string,
  id: string,
  supabase?: ServerSupabase,
): Promise<NewsletterRow | null> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("newsletters")
    .select(NEWSLETTER_COLS)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toNewsletter(data) : null;
}

export type SendRow = {
  id: string;
  email: string;
  status: "queued" | "sent" | "failed" | "blocked";
  blockedReasons: string[];
  error: string | null;
  sentAt: string | null;
  unsubscribedAt: string | null;
  contactId: string | null;
  contactName: string | null;
};

export async function listSends(workspaceId: string, newsletterId: string): Promise<SendRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletter_sends")
    .select(
      "id, email, status, blocked_reasons, error, sent_at, unsubscribed_at, contact_id, contact:contacts!newsletter_sends_workspace_id_contact_id_fkey(full_name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("newsletter_id", newsletterId)
    .order("status")
    .order("email")
    .limit(MAX_AUDIENCE);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status as SendRow["status"],
    blockedReasons: r.blocked_reasons,
    error: r.error,
    sentAt: r.sent_at,
    unsubscribedAt: r.unsubscribed_at,
    contactId: r.contact_id,
    contactName: r.contact?.full_name ?? null,
  }));
}

export type SuppressionRow = {
  id: string;
  channel: "email" | "sms";
  value: string;
  reason: string;
  note: string | null;
  createdAt: string;
  contactId: string | null;
  contactName: string | null;
  createdByName: string | null;
};

export async function listSuppressions(workspaceId: string): Promise<SuppressionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_suppressions")
    .select(
      "id, channel, value, reason, note, created_at, contact_id, contact:contacts!outreach_suppressions_workspace_id_contact_id_fkey(full_name), creator:profiles!outreach_suppressions_created_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    channel: r.channel as SuppressionRow["channel"],
    value: r.value,
    reason: r.reason,
    note: r.note,
    createdAt: r.created_at,
    contactId: r.contact_id,
    contactName: r.contact?.full_name ?? null,
    createdByName: r.creator?.full_name ?? r.creator?.email ?? null,
  }));
}

/** Suppressions that apply to one contact (its emails and phones), for the contact page. */
export async function suppressionsForContact(
  workspaceId: string,
  contact: GateContact,
): Promise<Suppressions> {
  const supabase = await createClient();
  const emails = contact.emails.map((e) => e.value.trim().toLowerCase());
  const phones = contact.phones
    .map((p) => normalizeGatePhone(p.value))
    .filter((v): v is string => v !== null);
  const values = [...emails, ...phones];
  if (values.length === 0) return { emails: new Set(), phones: new Set() };
  const { data, error } = await supabase
    .from("outreach_suppressions")
    .select("channel, value")
    .eq("workspace_id", workspaceId)
    .in("value", values);
  if (error) throw error;
  return {
    emails: new Set((data ?? []).filter((r) => r.channel === "email").map((r) => r.value)),
    phones: new Set((data ?? []).filter((r) => r.channel === "sms").map((r) => r.value)),
  };
}

/** Workspaces (other than this one) the user can write to — targets for "Copy to…". */
export function copyTargets<T extends { id: string; role: string }>(
  all: T[],
  currentId: string,
): T[] {
  return all.filter((w) => w.id !== currentId && w.role !== "viewer");
}
