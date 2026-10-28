/**
 * Who a newsletter goes to, and who the gates stop. Pure: the server loads the
 * contacts, settings and suppression list, then calls planNewsletter() right
 * before sending (and for the on-screen audience check).
 */
import {
  checkEmail,
  summarizeBlocks,
  type GateContact,
  type GateResult,
  type GateSettings,
  type Suppressions,
} from "./compliance";
import type { Audience } from "./schema";

export type AudienceContact = GateContact & {
  id: string;
  name: string;
  tags: string[];
  roles: string[];
};

export type PlannedRecipient = {
  contactId: string;
  name: string;
  /** Normalized email, or null when the contact has none. */
  email: string | null;
  gate: GateResult;
  /** Another contact in this send already has the same email. */
  duplicate: boolean;
};

export type NewsletterPlan = {
  matched: number;
  recipients: PlannedRecipient[];
  /** Contacts who would get the email (unique addresses, every gate passed). */
  sendable: PlannedRecipient[];
  summary: ReturnType<typeof summarizeBlocks>;
  duplicates: number;
};

export function matchesAudience(c: Pick<AudienceContact, "tags" | "roles">, a: Audience): boolean {
  const tags = c.tags.map((t) => t.toLowerCase());
  const tagOk = a.tags.length === 0 || a.tags.some((t) => tags.includes(t));
  const roleOk = a.roles.length === 0 || a.roles.some((r) => c.roles.includes(r));
  return tagOk && roleOk;
}

export function planNewsletter(
  contacts: AudienceContact[],
  audience: Audience,
  settings: GateSettings,
  suppressions: Suppressions,
): NewsletterPlan {
  const seen = new Set<string>();
  const recipients: PlannedRecipient[] = [];
  for (const c of contacts) {
    if (!matchesAudience(c, audience)) continue;
    const gate = checkEmail(c, settings, suppressions);
    const duplicate = gate.to !== null && seen.has(gate.to);
    if (gate.to) seen.add(gate.to);
    recipients.push({ contactId: c.id, name: c.name, email: gate.to, gate, duplicate });
  }
  const sendable = recipients.filter((r) => r.gate.allowed && !r.duplicate);
  return {
    matched: recipients.length,
    recipients,
    sendable,
    summary: summarizeBlocks(recipients.filter((r) => !r.duplicate).map((r) => r.gate)),
    duplicates: recipients.filter((r) => r.duplicate).length,
  };
}
