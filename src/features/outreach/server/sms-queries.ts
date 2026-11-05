import "server-only";

import { createClient } from "@/lib/supabase/server";

import { buildConversations, type InboxMessage } from "../inbox";
import { smsProviderConfig } from "../sms-provider";

export type SmsState = {
  /** Twilio credentials present in env. */
  providerConnected: boolean;
  enabled: boolean;
  fromNumber: string | null;
  messagingServiceSid: string | null;
  helpReply: string | null;
  helpReplyEs: string | null;
  hasWebhook: boolean;
  /** Everything needed to send is in place. */
  ready: boolean;
};

export async function getSmsState(workspaceId: string): Promise<SmsState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sms_settings")
    .select("enabled, from_number, messaging_service_sid, help_reply, help_reply_es, webhook_token_hash")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const providerConnected = smsProviderConfig().connected;
  const enabled = Boolean(data?.enabled);
  const hasSender = Boolean(data?.from_number || data?.messaging_service_sid);
  return {
    providerConnected,
    enabled,
    fromNumber: data?.from_number ?? null,
    messagingServiceSid: data?.messaging_service_sid ?? null,
    helpReply: data?.help_reply ?? null,
    helpReplyEs: data?.help_reply_es ?? null,
    hasWebhook: Boolean(data?.webhook_token_hash),
    ready: providerConnected && enabled && hasSender,
  };
}

/** Why texting can't be used right now, in plain words (null when it can). */
export function smsOffReason(s: SmsState): string | null {
  if (!s.providerConnected) return "Texting isn't connected yet (Twilio account not set up).";
  if (!s.fromNumber && !s.messagingServiceSid) return "No sending number set yet.";
  if (!s.enabled) return "Texting is switched off.";
  return null;
}

export type SmsMessage = {
  id: string;
  direction: "in" | "out";
  status: string;
  body: string;
  createdAt: string;
  error: string | null;
  blocks: { code: string; message: string }[];
  senderName: string | null;
};

export async function getSmsThread(workspaceId: string, contactId: string): Promise<SmsMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sms_messages")
    .select(
      "id, direction, status, body, created_at, error, blocks, sender:profiles!sms_messages_sent_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? [])
    .map((m) => ({
      id: m.id,
      direction: m.direction as "in" | "out",
      status: m.status,
      body: m.body,
      createdAt: m.created_at,
      error: m.error,
      blocks: Array.isArray(m.blocks) ? (m.blocks as { code: string; message: string }[]) : [],
      senderName: m.sender
        ? m.sender.full_name?.trim() || m.sender.email?.split("@")[0] || null
        : null,
    }))
    .reverse();
}

export type InboxRow = {
  contactId: string;
  name: string;
  phone: string | null;
  last: InboxMessage;
  unanswered: number;
  needsReply: boolean;
  messageCount: number;
};

/** Conversations for the Messages inbox (latest 2,000 texts, grouped per contact). */
export async function getInbox(workspaceId: string): Promise<InboxRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sms_messages")
    .select(
      "id, contact_id, direction, status, body, keyword, created_at, contact:contacts!sms_messages_workspace_id_contact_id_fkey(full_name, phones, deleted_at)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const contacts = new Map<string, { name: string; phone: string | null }>();
  const rows = (data ?? []).filter((r) => r.contact && !r.contact.deleted_at);
  for (const r of rows) {
    if (!r.contact_id || contacts.has(r.contact_id)) continue;
    const phones = Array.isArray(r.contact!.phones)
      ? (r.contact!.phones as { value?: string }[])
      : [];
    contacts.set(r.contact_id, {
      name: r.contact!.full_name?.trim() || phones[0]?.value || "Unknown",
      phone: phones[0]?.value ?? null,
    });
  }
  return buildConversations(
    rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      direction: r.direction as "in" | "out",
      status: r.status,
      body: r.body,
      keyword: r.keyword,
      createdAt: r.created_at,
    })),
  ).map((c) => ({ ...c, ...contacts.get(c.contactId)! }));
}
