"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { advance, firstDue, normalizeSteps, type SequenceStep } from "../sequences";
import { sendSms } from "./sms";

const stepSchema = z
  .object({
    channel: z.enum(["email", "sms"]),
    waitDays: z.coerce.number().int().min(0).max(90),
    subject: z.string().max(200).nullable(),
    body: z.string().trim().min(1, "Every step needs a message").max(5000),
  })
  .refine((s) => s.channel !== "sms" || s.body.length <= 1600, {
    message: "Text steps are 1,600 characters at most",
    path: ["body"],
  })
  .refine((s) => s.channel !== "email" || (s.subject ?? "").trim().length > 0, {
    message: "Email steps need a subject",
    path: ["subject"],
  });

const saveSchema = z.object({
  workspaceId: z.uuid(),
  sequenceId: z.uuid().nullable(),
  name: z.string().trim().min(1, "Name the sequence").max(120),
  description: z.string().trim().max(500),
  active: z.boolean(),
  steps: z.array(stepSchema).max(20, "20 steps at most"),
});

/** Create or update a sequence and replace its steps. Active sequences need at least one step. */
export async function saveSequence(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const v = parsed.data;
  if (v.active && v.steps.length === 0)
    return { ok: false, error: "Add at least one step before making it active" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  let id = v.sequenceId;
  if (id) {
    const { data, error } = await ctx.supabase
      .from("outreach_sequences")
      .update({ name: v.name, description: v.description || null, active: v.active })
      .eq("workspace_id", v.workspaceId)
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data?.length) return { ok: false, error: "Sequence not found." };
  } else {
    const { data, error } = await ctx.supabase
      .from("outreach_sequences")
      .insert({
        workspace_id: v.workspaceId,
        name: v.name,
        description: v.description || null,
        active: v.active,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendlyDbError(error) };
    id = data.id;
  }

  const steps = normalizeSteps(v.steps.map((s, i) => ({ ...s, position: i + 1 })));
  const del = await ctx.supabase
    .from("outreach_sequence_steps")
    .delete()
    .eq("workspace_id", v.workspaceId)
    .eq("sequence_id", id);
  if (del.error) return { ok: false, error: friendlyDbError(del.error) };
  if (steps.length) {
    const { error } = await ctx.supabase.from("outreach_sequence_steps").insert(
      steps.map((s) => ({
        workspace_id: v.workspaceId,
        sequence_id: id!,
        position: s.position,
        channel: s.channel,
        wait_days: s.waitDays,
        subject: s.subject,
        body: s.body,
      })),
    );
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  await writeAudit(ctx.supabase, {
    workspaceId: v.workspaceId,
    actorId: ctx.user.id,
    action: v.sequenceId ? "sequence.updated" : "sequence.created",
    entityType: "sequence",
    entityId: id,
    diff: { steps: steps.length, active: v.active },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: id! } };
}

export async function deleteSequence(input: {
  workspaceId: string;
  sequenceId: string;
}): Promise<ActionResult> {
  const p = z.object({ workspaceId: z.uuid(), sequenceId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("outreach_sequences")
    .delete()
    .eq("workspace_id", p.data.workspaceId)
    .eq("id", p.data.sequenceId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Sequence not found." };
  await writeAudit(ctx.supabase, {
    workspaceId: p.data.workspaceId,
    actorId: ctx.user.id,
    action: "sequence.deleted",
    entityType: "sequence",
    entityId: p.data.sequenceId,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

async function loadSteps(
  ctx: NonNullable<Awaited<ReturnType<typeof actionContext>>>,
  workspaceId: string,
  sequenceId: string,
): Promise<SequenceStep[]> {
  const { data } = await ctx.supabase
    .from("outreach_sequence_steps")
    .select("position, channel, wait_days, subject, body")
    .eq("workspace_id", workspaceId)
    .eq("sequence_id", sequenceId)
    .order("position");
  return (data ?? []).map((s) => ({
    position: s.position,
    channel: s.channel as "email" | "sms",
    waitDays: s.wait_days,
    subject: s.subject,
    body: s.body,
  }));
}

/** Put a contact into an active sequence. Do-not-contact people can't be enrolled. */
export async function enrollContact(input: {
  workspaceId: string;
  sequenceId: string;
  contactId: string;
}): Promise<ActionResult> {
  const p = z
    .object({ workspaceId: z.uuid(), sequenceId: z.uuid(), contactId: z.uuid() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const { workspaceId, sequenceId, contactId } = p.data;
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const [{ data: seq }, { data: contact }] = await Promise.all([
    ctx.supabase
      .from("outreach_sequences")
      .select("id, name, active")
      .eq("workspace_id", workspaceId)
      .eq("id", sequenceId)
      .maybeSingle(),
    ctx.supabase
      .from("contacts")
      .select("id, dnc")
      .eq("workspace_id", workspaceId)
      .eq("id", contactId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!seq) return { ok: false, error: "Sequence not found." };
  if (!seq.active) return { ok: false, error: "That sequence isn't active." };
  if (!contact) return { ok: false, error: "Contact not found." };
  if (contact.dnc) return { ok: false, error: "This contact is marked do-not-contact." };
  const first = firstDue(await loadSteps(ctx, workspaceId, sequenceId), new Date());
  if (!first) return { ok: false, error: "That sequence has no steps yet." };
  const { error } = await ctx.supabase.from("outreach_enrollments").insert({
    workspace_id: workspaceId,
    sequence_id: sequenceId,
    contact_id: contactId,
    next_position: first.position,
    next_due_at: first.dueAt.toISOString(),
    enrolled_by: ctx.user.id,
  });
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "Already in this sequence." : friendlyDbError(error),
    };
  await ctx.supabase.from("activities").insert({
    workspace_id: workspaceId,
    type: "note",
    subject_type: "contact",
    subject_id: contactId,
    body: `Added to the "${seq.name}" sequence`,
    metadata: toJson({ event: "sequence_enrolled", sequence_id: sequenceId }),
    created_by: ctx.user.id,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function stopEnrollment(input: {
  workspaceId: string;
  enrollmentId: string;
}): Promise<ActionResult> {
  const p = z.object({ workspaceId: z.uuid(), enrollmentId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("outreach_enrollments")
    .update({ status: "stopped", stop_reason: "Stopped by a team member" })
    .eq("workspace_id", p.data.workspaceId)
    .eq("id", p.data.enrollmentId)
    .eq("status", "active")
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "That sequence already ended for this contact." };
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const stepSchemaIn = z.object({
  workspaceId: z.uuid(),
  enrollmentId: z.uuid(),
  action: z.enum(["send_text", "mark_emailed", "skip"]),
  /** The message as the person finally wrote it (texts and emails). */
  body: z.string().trim().max(5000).optional(),
  subject: z.string().trim().max(200).optional(),
});

/**
 * Complete the due step of one enrollment:
 *  - send_text: through the gated texting path (blocked ⇒ nothing advances);
 *  - mark_emailed: the person sent it from their own mail app (DNC / unsubscribed refuse it);
 *  - skip: move on without sending.
 */
export async function completeStep(
  input: z.input<typeof stepSchemaIn>,
): Promise<ActionResult<{ finished: boolean }>> {
  const p = stepSchemaIn.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const { workspaceId, enrollmentId, action } = p.data;
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data: enr } = await ctx.supabase
    .from("outreach_enrollments")
    .select(
      "id, sequence_id, contact_id, status, next_position, contact:contacts!outreach_enrollments_workspace_id_contact_id_fkey(id, dnc, email_opt_out)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr || enr.status !== "active") return { ok: false, error: "This step is no longer due." };
  const steps = await loadSteps(ctx, workspaceId, enr.sequence_id);
  const step = steps.find((s) => s.position === enr.next_position);
  if (!step) return { ok: false, error: "This step no longer exists." };

  const record = (outcome: "sent" | "skipped" | "blocked", reason?: string) =>
    ctx.supabase.from("outreach_sequence_events").insert({
      workspace_id: workspaceId,
      enrollment_id: enrollmentId,
      position: step.position,
      channel: step.channel,
      outcome,
      reason: reason?.slice(0, 500) ?? null,
      actor_id: ctx.user.id,
    });

  if (action === "send_text") {
    if (step.channel !== "sms") return { ok: false, error: "This step is an email." };
    const r = await sendSms({
      workspaceId,
      contactId: enr.contact_id,
      body: p.data.body || step.body,
    });
    if (!r.ok) {
      await record("blocked", r.error);
      return { ok: false, error: r.error };
    }
  } else if (action === "mark_emailed") {
    if (step.channel !== "email") return { ok: false, error: "This step is a text." };
    if (enr.contact?.dnc) {
      await record("blocked", "Marked do-not-contact");
      return { ok: false, error: "This contact is marked do-not-contact." };
    }
    if (enr.contact?.email_opt_out) {
      await record("blocked", "Unsubscribed from email");
      return { ok: false, error: "This contact unsubscribed from email." };
    }
    await ctx.supabase.from("activities").insert({
      workspace_id: workspaceId,
      type: "email",
      subject_type: "contact",
      subject_id: enr.contact_id,
      body: `Email sent: ${p.data.subject || step.subject || "(no subject)"}\n\n${p.data.body || step.body}`.slice(
        0,
        20000,
      ),
      metadata: toJson({
        event: "sequence_step",
        enrollment_id: enrollmentId,
        position: step.position,
      }),
      created_by: ctx.user.id,
    });
  }
  await record(action === "skip" ? "skipped" : "sent");

  const next = advance(steps, step.position, new Date());
  const { error } = await ctx.supabase
    .from("outreach_enrollments")
    .update(
      next.finished
        ? { status: "finished", next_position: Math.min(21, step.position + 1) }
        : { next_position: next.position, next_due_at: next.dueAt.toISOString() },
    )
    .eq("workspace_id", workspaceId)
    .eq("id", enrollmentId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: { finished: next.finished } };
}
