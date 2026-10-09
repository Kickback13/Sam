"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { dealContactSchema, dealInputSchema, moveDealSchema } from "@/lib/validation/deal";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";
import type { ActivityItem } from "@/server/queries/activity";
import { getSubjectActivity } from "@/server/queries/activity";
import { getTasks, type TaskItem } from "@/server/queries/tasks";

const saveSchema = z.object({
  workspaceId: z.uuid(),
  dealId: z.uuid().optional(),
  deal: z.unknown(),
});

export async function saveDeal(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ id: string }>> {
  const envelope = saveSchema.safeParse(input);
  if (!envelope.success) return { ok: false, error: "Invalid request" };
  const parsed = dealInputSchema.safeParse(envelope.data.deal);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = envelope.data;
  const d = parsed.data;

  if (dealId) {
    const { data: before } = await ctx.supabase
      .from("deals")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", dealId)
      .maybeSingle();
    if (!before) return { ok: false, error: "Deal not found." };
    const { data, error } = await ctx.supabase
      .from("deals")
      .update(d)
      .eq("workspace_id", workspaceId)
      .eq("id", dealId)
      .select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data?.length) return { ok: false, error: "You can't edit deals in this workspace." };
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "deal.update",
      entityType: "deal",
      entityId: dealId,
      diff: diffFields(
        before as Record<string, unknown>,
        d as Record<string, unknown>,
        Object.keys(d),
      ),
    });
    revalidateWorkspace();
    return { ok: true, data: { id: dealId } };
  }

  // New deals go to the top of their stage.
  const { data: top } = await ctx.supabase
    .from("deals")
    .select("position")
    .eq("workspace_id", workspaceId)
    .eq("stage_id", d.stage_id)
    .is("deleted_at", null)
    .order("position")
    .limit(1);
  const position = top?.[0] ? top[0].position - 1000 : 1000;

  const { data, error } = await ctx.supabase
    .from("deals")
    .insert({
      ...d,
      workspace_id: workspaceId,
      position,
      created_by: ctx.user.id,
      assigned_to: d.assigned_to ?? ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "deal.create",
    entityType: "deal",
    entityId: data.id,
    diff: diffFields(null, d as Record<string, unknown>),
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

/** Move within/between stages. Stage history + activity are written by the database trigger. */
export async function moveDeal(
  input: z.input<typeof moveDealSchema> & { workspaceId: string },
): Promise<ActionResult> {
  const parsed = moveDealSchema.extend({ workspaceId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId, stageId, position, lostReason } = parsed.data;

  const { data: stage } = await ctx.supabase
    .from("pipeline_stages")
    .select("id, name, is_lost")
    .eq("workspace_id", workspaceId)
    .eq("id", stageId)
    .maybeSingle();
  if (!stage) return { ok: false, error: "That stage doesn't exist." };
  if (stage.is_lost && !lostReason)
    return { ok: false, error: "Add a reason when marking a deal lost." };

  const { data: before } = await ctx.supabase
    .from("deals")
    .select("stage_id, position")
    .eq("workspace_id", workspaceId)
    .eq("id", dealId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Deal not found." };

  const patch: { stage_id: string; position: number; lost_reason?: string | null } = {
    stage_id: stageId,
    position,
  };
  if (stage.is_lost) patch.lost_reason = lostReason;
  const { data, error } = await ctx.supabase
    .from("deals")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", dealId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't move deals in this workspace." };

  if (before.stage_id !== stageId) {
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "deal.stage_change",
      entityType: "deal",
      entityId: dealId,
      diff: { stage_id: { from: before.stage_id, to: stageId }, lost_reason: lostReason ?? null },
    });
  }
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteDeal(input: {
  workspaceId: string;
  dealId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), dealId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("id", parsed.data.dealId)
    .select("id, title");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete deals in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "deal.delete",
    entityType: "deal",
    entityId: parsed.data.dealId,
    diff: { title: data[0].title, soft_delete: true },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function addDealContact(
  input: z.input<typeof dealContactSchema> & { workspaceId: string },
): Promise<ActionResult> {
  const parsed = dealContactSchema.extend({ workspaceId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId, contactId, role } = parsed.data;
  const { error } = await ctx.supabase
    .from("deal_contacts")
    .upsert(
      { workspace_id: workspaceId, deal_id: dealId, contact_id: contactId, role },
      { onConflict: "deal_id,contact_id" },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "deal.contact_add",
    entityType: "deal",
    entityId: dealId,
    diff: { contact_id: contactId, role },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function removeDealContact(input: {
  workspaceId: string;
  dealId: string;
  contactId: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workspaceId: z.uuid(), dealId: z.uuid(), contactId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId, contactId } = parsed.data;
  const { error } = await ctx.supabase
    .from("deal_contacts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .eq("contact_id", contactId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "deal.contact_remove",
    entityType: "deal",
    entityId: dealId,
    diff: { contact_id: contactId },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export type DealDetail = {
  deal: {
    id: string;
    title: string;
    pipelineId: string;
    stageId: string;
    status: "open" | "won" | "lost";
    value: number | null;
    askingPrice: number | null;
    units: number | null;
    source: string | null;
    expectedClose: string | null;
    lostReason: string | null;
    notes: string | null;
    assignedTo: string | null;
    closedAt: string | null;
    createdAt: string;
    property: { id: string; label: string } | null;
    primaryContact: { id: string; label: string } | null;
  };
  contacts: { id: string; name: string; role: string | null }[];
  history: { id: string; from: string | null; to: string | null; at: string; by: string | null }[];
  activity: ActivityItem[];
  tasks: TaskItem[];
};

/** Everything the deal drawer shows, loaded on demand. */
export async function loadDeal(input: {
  workspaceId: string;
  dealId: string;
}): Promise<ActionResult<DealDetail>> {
  const parsed = z.object({ workspaceId: z.uuid(), dealId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = parsed.data;

  const { data: d, error } = await ctx.supabase
    .from("deals")
    .select(
      "*, property:properties!deals_workspace_id_property_id_fkey(id, name, address), contact:contacts!deals_workspace_id_primary_contact_id_fkey(id, full_name, emails)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", dealId)
    .maybeSingle();
  if (error || !d || d.deleted_at) return { ok: false, error: "Deal not found." };

  const [contacts, history, activity, tasks] = await Promise.all([
    ctx.supabase
      .from("deal_contacts")
      .select(
        "role, contact:contacts!deal_contacts_workspace_id_contact_id_fkey(id, full_name, emails)",
      )
      .eq("workspace_id", workspaceId)
      .eq("deal_id", dealId),
    ctx.supabase
      .from("deal_stage_history")
      .select(
        "id, from_stage_name, to_stage_name, changed_at, changer:profiles!deal_stage_history_changed_by_fkey(full_name, email)",
      )
      .eq("workspace_id", workspaceId)
      .eq("deal_id", dealId)
      .order("changed_at", { ascending: false })
      .limit(50),
    getSubjectActivity(workspaceId, [{ type: "deal", id: dealId }]),
    getTasks(workspaceId, { related: [{ type: "deal", id: dealId }] }),
  ]);

  const emailOf = (emails: unknown) =>
    Array.isArray(emails) ? ((emails[0] as { value?: string })?.value ?? null) : null;
  return {
    ok: true,
    data: {
      deal: {
        id: d.id,
        title: d.title,
        pipelineId: d.pipeline_id,
        stageId: d.stage_id,
        status: d.status,
        value: d.value,
        askingPrice: d.asking_price,
        units: d.units,
        source: d.source,
        expectedClose: d.expected_close,
        lostReason: d.lost_reason,
        notes: d.notes,
        assignedTo: d.assigned_to,
        closedAt: d.closed_at,
        createdAt: d.created_at,
        property: d.property
          ? { id: d.property.id, label: d.property.name ?? d.property.address }
          : null,
        primaryContact: d.contact
          ? {
              id: d.contact.id,
              label: d.contact.full_name ?? emailOf(d.contact.emails) ?? "Contact",
            }
          : null,
      },
      contacts: (contacts.data ?? [])
        .filter((c) => c.contact)
        .map((c) => ({
          id: c.contact!.id,
          name: c.contact!.full_name ?? emailOf(c.contact!.emails) ?? "Contact",
          role: c.role,
        })),
      history: (history.data ?? []).map((h) => ({
        id: h.id,
        from: h.from_stage_name,
        to: h.to_stage_name,
        at: h.changed_at,
        by: h.changer?.full_name || h.changer?.email || null,
      })),
      activity,
      tasks,
    },
  };
}
