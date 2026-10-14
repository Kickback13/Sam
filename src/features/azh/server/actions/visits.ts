"use server";

import { z } from "zod";

import { formatDateTime } from "@/lib/format";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { findConflicts } from "../../schedule/conflicts";
import { zonedDateTime } from "../../schedule/time";
import { visitSchema, visitStatusSchema } from "../../validation";

export type VisitConflict = { id: string; when: string; label: string };

type ScheduleResult =
  | { ok: true; data: { id: string } }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
      conflicts?: VisitConflict[];
    };

/**
 * Book an internal estimate visit. If the estimator is already booked at that
 * time, return the clashes as a warning unless `confirmOverlap` is set (AZH-007).
 */
export async function scheduleVisit(input: {
  workspaceId: string;
  visit: unknown;
  confirmOverlap?: boolean;
}): Promise<ScheduleResult> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const parsed = visitSchema.safeParse(input.visit);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const v = parsed.data;
  const startsAt = zonedDateTime(v.date, v.time);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "That date/time isn't valid." };
  const endsAt = new Date(startsAt.getTime() + v.duration_min * 60_000);

  if (v.estimator_id && !input.confirmOverlap) {
    const { data: sameDay, error } = await ctx.supabase
      .from("azh_visits")
      .select(
        "id, estimator_id, starts_at, ends_at, status, address, deal:deals!azh_visits_workspace_id_deal_id_fkey(title)",
      )
      .eq("workspace_id", ws.data)
      .eq("estimator_id", v.estimator_id)
      .neq("status", "canceled")
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString());
    if (error) return { ok: false, error: friendlyDbError(error) };
    const clashes = findConflicts(
      { id: "new", estimatorId: v.estimator_id, startsAt, endsAt },
      (sameDay ?? []).map((x) => ({
        id: x.id,
        estimatorId: x.estimator_id,
        startsAt: x.starts_at,
        endsAt: x.ends_at,
        status: x.status,
      })),
    );
    if (clashes.length)
      return {
        ok: false,
        error: "This estimator is already booked at that time.",
        conflicts: clashes.map((c) => {
          const row = sameDay!.find((x) => x.id === c.id)!;
          return {
            id: c.id,
            when: formatDateTime(row.starts_at),
            label: row.deal?.title ?? row.address ?? "Estimate visit",
          };
        }),
      };
  }

  const { data, error } = await ctx.supabase
    .from("azh_visits")
    .insert({
      workspace_id: ws.data,
      request_id: v.request_id,
      deal_id: v.deal_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      office: v.office,
      estimator_id: v.estimator_id,
      address: v.address,
      notes: v.notes,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Note on the project timeline (no message is sent to anyone).
  if (v.deal_id) {
    await ctx.supabase.from("activities").insert({
      workspace_id: ws.data,
      type: "meeting",
      subject_type: "deal",
      subject_id: v.deal_id,
      body: `Estimate visit scheduled for ${formatDateTime(startsAt)}${v.address ? ` at ${v.address}` : ""}`,
      metadata: { visit_id: data.id, request_id: v.request_id },
      created_by: ctx.user.id,
    });
  }
  await writeAudit(ctx.supabase, {
    workspaceId: ws.data,
    actorId: ctx.user.id,
    action: "azh_visit.create",
    entityType: "azh_visit",
    entityId: data.id,
    diff: {
      starts_at: startsAt.toISOString(),
      estimator_id: v.estimator_id,
      overlap_confirmed: Boolean(input.confirmOverlap),
    },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function setVisitStatus(input: {
  workspaceId: string;
  visitId: string;
  status: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workspaceId: z.uuid(), visitId: z.uuid(), status: visitStatusSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, visitId, status } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("azh_visits")
    .update({ status })
    .eq("workspace_id", workspaceId)
    .eq("id", visitId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change visits in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_visit.status",
    entityType: "azh_visit",
    entityId: visitId,
    diff: { status },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
