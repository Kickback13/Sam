import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { SequenceStep } from "../sequences";
import { STEP_COLUMNS, stepFromRow } from "../step-row";

export type SequenceListItem = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: number;
  activeEnrollments: number;
  updatedAt: string;
};

export async function listSequences(workspaceId: string): Promise<SequenceListItem[]> {
  const supabase = await createClient();
  const [{ data: seqs, error }, { data: steps }, { data: enr }] = await Promise.all([
    supabase
      .from("outreach_sequences")
      .select("id, name, description, active, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
    supabase.from("outreach_sequence_steps").select("sequence_id").eq("workspace_id", workspaceId),
    supabase
      .from("outreach_enrollments")
      .select("sequence_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);
  if (error) throw error;
  const count = (rows: { sequence_id: string }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.sequence_id === id).length;
  return (seqs ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    active: s.active,
    steps: count(steps, s.id),
    activeEnrollments: count(enr, s.id),
    updatedAt: s.updated_at,
  }));
}

export type SequenceDetail = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: SequenceStep[];
  enrollments: {
    id: string;
    contactId: string;
    contactName: string;
    status: string;
    nextPosition: number;
    nextDueAt: string;
    stopReason: string | null;
  }[];
};

export async function getSequence(workspaceId: string, id: string): Promise<SequenceDetail | null> {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("outreach_sequences")
    .select("id, name, description, active")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const [{ data: steps }, { data: enr }] = await Promise.all([
    supabase
      .from("outreach_sequence_steps")
      .select(STEP_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("sequence_id", id)
      .order("position"),
    supabase
      .from("outreach_enrollments")
      .select(
        "id, contact_id, status, next_position, next_due_at, stop_reason, contact:contacts!outreach_enrollments_workspace_id_contact_id_fkey(full_name)",
      )
      .eq("workspace_id", workspaceId)
      .eq("sequence_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  return {
    ...s,
    steps: (steps ?? []).map(stepFromRow),
    enrollments: (enr ?? []).map((e) => ({
      id: e.id,
      contactId: e.contact_id,
      contactName: e.contact?.full_name?.trim() || "Contact",
      status: e.status,
      nextPosition: e.next_position,
      nextDueAt: e.next_due_at,
      stopReason: e.stop_reason,
    })),
  };
}

export type DueStep = {
  enrollmentId: string;
  sequenceId: string;
  sequenceName: string;
  contactId: string;
  contact: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    company: string | null;
    email: string | null;
    dnc: boolean;
    email_opt_out: boolean;
    language: string;
  };
  step: SequenceStep;
  totalSteps: number;
  dueAt: string;
};

/** Steps due now (oldest first), for the people working the queue. */
export async function getDueSteps(workspaceId: string, contactId?: string): Promise<DueStep[]> {
  const supabase = await createClient();
  let q = supabase
    .from("outreach_enrollments")
    .select(
      "id, sequence_id, contact_id, next_position, next_due_at, sequence:outreach_sequences!outreach_enrollments_workspace_id_sequence_id_fkey(name), contact:contacts!outreach_enrollments_workspace_id_contact_id_fkey(first_name, last_name, full_name, emails, dnc, email_opt_out, language, deleted_at, company:companies!contacts_workspace_id_company_id_fkey(name))",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .lte("next_due_at", new Date().toISOString())
    .order("next_due_at")
    .limit(200);
  if (contactId) q = q.eq("contact_id", contactId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).filter((r) => r.contact && !r.contact.deleted_at);
  const seqIds = [...new Set(rows.map((r) => r.sequence_id))];
  const { data: steps } = seqIds.length
    ? await supabase
        .from("outreach_sequence_steps")
        .select(`sequence_id, ${STEP_COLUMNS}`)
        .eq("workspace_id", workspaceId)
        .in("sequence_id", seqIds)
    : { data: [] };
  const out: DueStep[] = [];
  for (const r of rows) {
    const mine = (steps ?? []).filter((s) => s.sequence_id === r.sequence_id);
    const s = mine.find((x) => x.position === r.next_position);
    if (!s) continue;
    const emails = (Array.isArray(r.contact!.emails) ? r.contact!.emails : []) as {
      value?: string;
      is_primary?: boolean;
    }[];
    out.push({
      enrollmentId: r.id,
      sequenceId: r.sequence_id,
      sequenceName: r.sequence?.name ?? "Sequence",
      contactId: r.contact_id,
      contact: {
        first_name: r.contact!.first_name,
        last_name: r.contact!.last_name,
        full_name: r.contact!.full_name,
        company: r.contact!.company?.name ?? null,
        email: (emails.find((e) => e.is_primary) ?? emails[0])?.value ?? null,
        dnc: r.contact!.dnc,
        email_opt_out: r.contact!.email_opt_out,
        language: r.contact!.language,
      },
      step: stepFromRow(s),
      totalSteps: mine.length,
      dueAt: r.next_due_at,
    });
  }
  return out;
}

/** A contact's sequences (for the contact page). */
export async function getContactEnrollments(workspaceId: string, contactId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_enrollments")
    .select(
      "id, status, next_position, next_due_at, stop_reason, sequence:outreach_sequences!outreach_enrollments_workspace_id_sequence_id_fkey(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((e) => ({
    id: e.id,
    status: e.status,
    nextPosition: e.next_position,
    nextDueAt: e.next_due_at,
    stopReason: e.stop_reason,
    sequenceId: e.sequence?.id ?? "",
    sequenceName: e.sequence?.name ?? "Sequence",
  }));
}
