"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { budgetLineSchema, changeOrderSchema, costSchema } from "../../validation";

const dealIds = z.object({ workspaceId: z.uuid(), dealId: z.uuid() });
const rowIds = z.object({ workspaceId: z.uuid(), id: z.uuid() });

type Table = "azh_budget_lines" | "azh_costs" | "azh_change_orders";

async function audit(
  ctx: NonNullable<Awaited<ReturnType<typeof actionContext>>>,
  workspaceId: string,
  action: string,
  entityId: string,
  diff: Record<string, unknown>,
) {
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action,
    entityType: action.split(".")[0],
    entityId,
    diff,
  });
}

async function removeRow(
  table: Table,
  input: { workspaceId: string; id: string },
  onlyPending = false,
): Promise<ActionResult> {
  const ids = rowIds.safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, id } = ids.data;
  const { data, error } = onlyPending
    ? await ctx.supabase
        .from("azh_change_orders")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .eq("status", "pending")
        .select("id")
    : await ctx.supabase
        .from(table)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length)
    return {
      ok: false,
      error: onlyPending ? "Only pending change orders can be deleted." : "Nothing was deleted.",
    };
  await audit(ctx, ids.data.workspaceId, `${table.replace(/s$/, "")}.delete`, ids.data.id, {});
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------
export async function addBudgetLine(
  input: z.input<typeof dealIds> & { line: unknown },
): Promise<ActionResult> {
  const ids = dealIds.safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const line = budgetLineSchema.safeParse(input.line);
  if (!line.success)
    return { ok: false, error: "Check the budget line", fieldErrors: zodFieldErrors(line.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = ids.data;
  const { count } = await ctx.supabase
    .from("azh_budget_lines")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId);
  const { data, error } = await ctx.supabase
    .from("azh_budget_lines")
    .insert({ ...line.data, workspace_id: workspaceId, deal_id: dealId, position: count ?? 0 })
    .select("id")
    .single();
  if (error)
    return {
      ok: false,
      error:
        error.code === "23505" ? "That category is already in the budget." : friendlyDbError(error),
    };
  await audit(ctx, workspaceId, "azh_budget_line.create", data.id, line.data);
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function updateBudgetLine(input: {
  workspaceId: string;
  id: string;
  budgeted: unknown;
}): Promise<ActionResult> {
  const ids = rowIds.safeParse(input);
  const line = budgetLineSchema.pick({ budgeted: true }).safeParse({ budgeted: input.budgeted });
  if (!ids.success || !line.success) return { ok: false, error: "Enter an amount of 0 or more" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("azh_budget_lines")
    .update(line.data)
    .eq("workspace_id", ids.data.workspaceId)
    .eq("id", ids.data.id)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't change the budget in this workspace." };
  await audit(ctx, ids.data.workspaceId, "azh_budget_line.update", ids.data.id, line.data);
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteBudgetLine(input: { workspaceId: string; id: string }) {
  return removeRow("azh_budget_lines", input);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
export async function addCost(
  input: z.input<typeof dealIds> & { cost: unknown },
): Promise<ActionResult> {
  const ids = dealIds.safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const cost = costSchema.safeParse(input.cost);
  if (!cost.success)
    return { ok: false, error: "Check the cost entry", fieldErrors: zodFieldErrors(cost.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = ids.data;
  const { amount, ...rest } = cost.data;
  const { data, error } = await ctx.supabase
    .from("azh_costs")
    .insert({
      ...rest,
      amount: amount ?? 0,
      workspace_id: workspaceId,
      deal_id: dealId,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await audit(ctx, workspaceId, "azh_cost.create", data.id, cost.data);
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteCost(input: { workspaceId: string; id: string }) {
  return removeRow("azh_costs", input);
}

// ---------------------------------------------------------------------------
// Change orders (approved ones add to the contract value — DB trigger)
// ---------------------------------------------------------------------------
export async function addChangeOrder(
  input: z.input<typeof dealIds> & { order: unknown },
): Promise<ActionResult> {
  const ids = dealIds.safeParse(input);
  if (!ids.success) return { ok: false, error: "Invalid request" };
  const order = changeOrderSchema.safeParse(input.order);
  if (!order.success)
    return { ok: false, error: "Check the change order", fieldErrors: zodFieldErrors(order.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, dealId } = ids.data;
  const { data, error } = await ctx.supabase
    .from("azh_change_orders")
    .insert({
      workspace_id: workspaceId,
      deal_id: dealId,
      number: 0, // numbered by trigger
      description: order.data.description,
      amount: order.data.amount ?? 0,
      status: order.data.status,
      created_by: ctx.user.id,
    })
    .select("id, number")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await audit(ctx, workspaceId, "azh_change_order.create", data.id, {
    ...order.data,
    number: data.number,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function setChangeOrderStatus(input: {
  workspaceId: string;
  id: string;
  status: string;
}): Promise<ActionResult> {
  const ids = rowIds.safeParse(input);
  const status = changeOrderSchema.shape.status.safeParse(input.status);
  if (!ids.success || !status.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("azh_change_orders")
    .update({ status: status.data })
    .eq("workspace_id", ids.data.workspaceId)
    .eq("id", ids.data.id)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length)
    return { ok: false, error: "You can't change change orders in this workspace." };
  await audit(ctx, ids.data.workspaceId, "azh_change_order.status", ids.data.id, {
    status: status.data,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteChangeOrder(input: { workspaceId: string; id: string }) {
  return removeRow("azh_change_orders", input, true);
}
