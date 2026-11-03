import { createHash } from "node:crypto";

import type { GhlContact, GhlOpportunity } from "./client";
import {
  ghlContactToRow,
  planOpportunity,
  type DealPlan,
  smsBlockedPhones,
  type LocalStage,
  type StageMap,
} from "./map";

/**
 * Automatic GoHighLevel import (Phase 5B): pure decisions. One-way, read-only.
 *
 * Each run reads GHL and compares every record with the fingerprint stored at the
 * last run (ghl_sync_state). Only records GHL changed are written here, so edits
 * made in this app are not overwritten by an unchanged GHL copy every few hours.
 */

export const SYNC_INTERVALS = [
  { minutes: 60, label: "Every hour" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 1440, label: "Once a day" },
] as const;
export type SyncInterval = (typeof SYNC_INTERVALS)[number]["minutes"];

/** Stable JSON: object keys sorted, so the same data always hashes the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

/** What the import reads from a contact (the CSV-shaped row + SMS do-not-disturb numbers). */
export function contactFingerprint(c: GhlContact): string {
  return fingerprint({ row: ghlContactToRow(c), smsOff: smsBlockedPhones(c).sort() });
}

/** What the import reads from an opportunity. */
export function opportunityFingerprint(o: GhlOpportunity): string {
  return fingerprint({
    name: o.name ?? null,
    value: o.monetaryValue ?? null,
    pipeline: o.pipelineId ?? null,
    stage: o.pipelineStageId ?? null,
    status: (o.status ?? "open").toLowerCase(),
    contact: o.contactId ?? null,
  });
}

/** Contacts to send through the import engine: new to us, or changed in GHL since last run. */
export function changedContacts(
  contacts: GhlContact[],
  seen: Map<string, string>,
): { contact: GhlContact; fingerprint: string }[] {
  return contacts
    .map((contact) => ({ contact, fingerprint: contactFingerprint(contact) }))
    .filter(({ contact, fingerprint: fp }) => seen.get(contact.id) !== fp);
}

export type OpportunitySyncPlan =
  | { kind: "unchanged" }
  /** Imported before this feature existed: remember it, but don't move the deal. */
  | { kind: "baseline" }
  | { kind: "skip"; reason: string }
  | { kind: "create"; plan: Extract<DealPlan, { action: "create" }> }
  | { kind: "update"; dealId: string; stageId: string; value: number | null };

/**
 * Decide what one GHL opportunity does this run.
 * - Linked to a deal and unchanged in GHL → nothing (local moves stay).
 * - Linked, no fingerprint yet (imported by the one-time import) → record it only.
 * - Linked and changed in GHL → move the deal to the mapped stage / new value.
 * - Not linked → create the deal (same rules as the one-time import).
 */
export function planOpportunitySync(input: {
  opportunity: GhlOpportunity;
  previous: string | undefined;
  linkedDealId: string | undefined;
  stageMap: StageMap;
  local: LocalStage[];
}): OpportunitySyncPlan {
  const { opportunity, previous, linkedDealId, stageMap, local } = input;
  const fp = opportunityFingerprint(opportunity);
  if (linkedDealId) {
    if (previous === fp) return { kind: "unchanged" };
    if (previous === undefined) return { kind: "baseline" };
  } else if (previous === fp) {
    // Seen before and skipped (e.g. an unmapped stage); unchanged since.
    return { kind: "unchanged" };
  }
  const plan = planOpportunity(opportunity, stageMap, local);
  if (plan.action === "skip") return { kind: "skip", reason: plan.reason };
  if (linkedDealId)
    return { kind: "update", dealId: linkedDealId, stageId: plan.stageId, value: plan.value };
  return { kind: "create", plan };
}

/** Is an automatic run due? (The database lock re-checks this atomically.) */
export function isSyncDue(
  s: {
    enabled: boolean;
    interval_minutes: number;
    last_started_at: string | null;
    lock_until: string | null;
  },
  now: Date,
): boolean {
  if (!s.enabled) return false;
  if (s.lock_until && new Date(s.lock_until) > now) return false;
  if (!s.last_started_at) return true;
  return now.getTime() - new Date(s.last_started_at).getTime() >= s.interval_minutes * 60_000;
}

export type SyncSummary = {
  contacts: { checked: number; changed: number; created: number; updated: number; errors: number };
  opportunities: { checked: number; created: number; moved: number; skipped: number };
  /** Stopped early to stay inside the time budget; the next run continues. */
  partial: boolean;
};

export function emptySummary(): SyncSummary {
  return {
    contacts: { checked: 0, changed: 0, created: 0, updated: 0, errors: 0 },
    opportunities: { checked: 0, created: 0, moved: 0, skipped: 0 },
    partial: false,
  };
}

/** One line for the Integrations page and the audit log. */
export function describeSummary(s: SyncSummary): string {
  const parts: string[] = [];
  const c = s.contacts;
  if (c.created || c.updated) parts.push(`${c.created} new / ${c.updated} updated contacts`);
  const o = s.opportunities;
  if (o.created) parts.push(`${o.created} new deal${o.created === 1 ? "" : "s"}`);
  if (o.moved) parts.push(`${o.moved} deal${o.moved === 1 ? "" : "s"} moved`);
  if (c.errors) parts.push(`${c.errors} contact error${c.errors === 1 ? "" : "s"}`);
  if (o.skipped) parts.push(`${o.skipped} opportunit${o.skipped === 1 ? "y" : "ies"} skipped`);
  const text = parts.length ? parts.join(" · ") : "No changes in GoHighLevel";
  return s.partial ? `${text} (stopped early, continues next run)` : text;
}
