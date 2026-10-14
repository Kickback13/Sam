"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { callLogSchema, requestUpdateSchema } from "../../validation";

const ids = z.object({ workspaceId: z.uuid(), requestId: z.uuid() });

export async function updateRequest(
  input: z.input<typeof ids> & { patch: unknown },
): Promise<ActionResult> {
  const env = ids.safeParse(input);
  const patch = requestUpdateSchema.safeParse(input.patch);
  if (!env.success || !patch.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, requestId } = env.data;
  const { data: before } = await ctx.supabase
    .from("azh_requests")
    .select("status, office, assigned_to")
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Request not found." };
  const { data, error } = await ctx.supabase
    .from("azh_requests")
    .update(patch.data)
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change requests in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_request.update",
    entityType: "azh_request",
    entityId: requestId,
    diff: diffFields(before, patch.data, Object.keys(patch.data)),
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const OUTCOME_LABEL = { reached: "Reached", voicemail: "Left voicemail", no_answer: "No answer" };

/** Log a phone call on the request's project (or contact). New requests become "contacted". */
export async function logRequestCall(
  input: z.input<typeof ids> & { call: unknown },
): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const call = callLogSchema.safeParse(input.call);
  if (!call.success)
    return { ok: false, error: "Add a short note", fieldErrors: zodFieldErrors(call.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, requestId } = env.data;
  const { data: req } = await ctx.supabase
    .from("azh_requests")
    .select("status, deal_id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  const subject = req.deal_id
    ? { subject_type: "deal" as const, subject_id: req.deal_id }
    : req.contact_id
      ? { subject_type: "contact" as const, subject_id: req.contact_id }
      : null;
  if (!subject)
    return { ok: false, error: "This request has no contact or project to log against." };

  const { error } = await ctx.supabase.from("activities").insert({
    workspace_id: workspaceId,
    type: "call",
    ...subject,
    body: `${OUTCOME_LABEL[call.data.outcome]} — ${call.data.body}`,
    metadata: { request_id: requestId, outcome: call.data.outcome },
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (req.status === "new" && call.data.outcome === "reached") {
    await ctx.supabase
      .from("azh_requests")
      .update({ status: "contacted" })
      .eq("workspace_id", workspaceId)
      .eq("id", requestId);
  }
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_request.call",
    entityType: "azh_request",
    entityId: requestId,
    diff: { outcome: call.data.outcome },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/**
 * Convert a request into an active project: make sure it has a deal + project
 * row, move a Lead to the Estimate stage, and mark the request converted.
 */
export async function convertRequest(
  input: z.input<typeof ids>,
): Promise<ActionResult<{ dealId: string }>> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, requestId } = env.data;
  const sb = ctx.supabase;

  const { data: req } = await sb
    .from("azh_requests")
    .select("*, contact:contacts!azh_requests_workspace_id_contact_id_fkey(full_name)")
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };

  const { data: pipeline } = await sb
    .from("pipelines")
    .select("id, pipeline_stages(id, name, position, is_won, is_lost)")
    .eq("workspace_id", workspaceId)
    .eq("kind", "construction_project")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pipeline)
    return { ok: false, error: "Add a Projects pipeline first (Settings → Pipelines)." };
  const open = [...pipeline.pipeline_stages]
    .filter((s) => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  const first = open[0];
  const estimate = open.find((s) => s.name.toLowerCase() === "estimate") ?? open[1] ?? first;
  if (!first) return { ok: false, error: "The Projects pipeline has no open stages." };

  let dealId = req.deal_id;
  if (!dealId) {
    const title = [req.service_type, req.contact?.full_name, req.job_address]
      .filter(Boolean)
      .join(" — ");
    const { data: deal, error } = await sb
      .from("deals")
      .insert({
        workspace_id: workspaceId,
        pipeline_id: pipeline.id,
        stage_id: estimate.id,
        title: title.slice(0, 200) || "Homeowner request",
        primary_contact_id: req.contact_id,
        source: "Homeowner request",
        notes: req.description,
        created_by: ctx.user.id,
        assigned_to: req.assigned_to ?? ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendlyDbError(error) };
    dealId = deal.id;
  } else {
    const { data: deal } = await sb
      .from("deals")
      .select("stage_id")
      .eq("workspace_id", workspaceId)
      .eq("id", dealId)
      .maybeSingle();
    if (deal?.stage_id === first.id && estimate.id !== first.id) {
      const { error } = await sb
        .from("deals")
        .update({ stage_id: estimate.id })
        .eq("workspace_id", workspaceId)
        .eq("id", dealId);
      if (error) return { ok: false, error: friendlyDbError(error) };
    }
  }

  const { error: projectError } = await sb.from("azh_projects").upsert(
    {
      deal_id: dealId,
      workspace_id: workspaceId,
      job_address: req.job_address,
      job_zip: req.job_zip,
      office: req.office,
      service_types: req.service_type ? [req.service_type] : [],
      source: "Homeowner request",
    },
    { onConflict: "deal_id", ignoreDuplicates: true },
  );
  if (projectError) return { ok: false, error: friendlyDbError(projectError) };

  const { error } = await sb
    .from("azh_requests")
    .update({ status: "converted", deal_id: dealId })
    .eq("workspace_id", workspaceId)
    .eq("id", requestId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await writeAudit(sb, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_request.convert",
    entityType: "azh_request",
    entityId: requestId,
    diff: { deal_id: dealId },
  });
  revalidateWorkspace();
  return { ok: true, data: { dealId } };
}
