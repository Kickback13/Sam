/**
 * Messages inbox (module 16 / Phase 4 reply inbox, ADR-037): one row per contact,
 * newest conversation first, built from the existing text log. Pure, unit-tested.
 */

export type InboxMessage = {
  id: string;
  contactId: string | null;
  direction: "in" | "out";
  status: string;
  body: string;
  keyword: string | null;
  createdAt: string;
};

export type Conversation = {
  contactId: string;
  last: InboxMessage;
  /** Inbound texts since our last outbound one (STOP/START/HELP excluded). */
  unanswered: number;
  needsReply: boolean;
  messageCount: number;
};

/** Group messages (any order) into conversations, newest first. */
export function buildConversations(messages: InboxMessage[]): Conversation[] {
  const byContact = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    if (!m.contactId) continue;
    byContact.set(m.contactId, [...(byContact.get(m.contactId) ?? []), m]);
  }
  const out: Conversation[] = [];
  for (const [contactId, list] of byContact) {
    list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    let unanswered = 0;
    for (const m of list) {
      if (m.direction === "out" && m.status !== "blocked" && m.status !== "failed") break;
      if (m.direction === "in" && !m.keyword) unanswered += 1;
    }
    out.push({
      contactId,
      last: list[0],
      unanswered,
      needsReply: unanswered > 0,
      messageCount: list.length,
    });
  }
  return out.sort((a, b) => Date.parse(b.last.createdAt) - Date.parse(a.last.createdAt));
}

export type InboxFilter = "all" | "needs_reply";

export function filterConversations<T extends Conversation>(list: T[], filter: InboxFilter): T[] {
  return filter === "needs_reply" ? list.filter((c) => c.needsReply) : list;
}

/** One-line preview of a message for the list. */
export function preview(m: InboxMessage, max = 90): string {
  const text = m.body.replace(/\s+/g, " ").trim();
  const clipped = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  if (m.direction === "in") return clipped;
  if (m.status === "blocked") return `Not sent: ${clipped}`;
  if (m.status === "failed" || m.status === "undelivered") return `Failed: ${clipped}`;
  return `You: ${clipped}`;
}
