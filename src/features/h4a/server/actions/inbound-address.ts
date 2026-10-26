"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { formatAddress, generateToken, hashToken, tokenHint } from "../../inbound/address";
import { inboundConfig } from "../config";

const schema = z.object({ workspaceId: z.uuid() });

/**
 * Create (or replace) the workspace's forwarding address. Owners/admins only
 * (RLS). Only the SHA-256 of the token is stored, so the full address is
 * returned once, here. Replacing it stops the old address working.
 */
export async function createInboundAddress(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ token: string; address: string | null; hint: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const token = generateToken();
  const { error } = await ctx.supabase.from("h4a_inbound_addresses").upsert(
    {
      workspace_id: parsed.data.workspaceId,
      token_hash: hashToken(token),
      token_hint: tokenHint(token),
      created_by: ctx.user.id,
    },
    { onConflict: "workspace_id" },
  );
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only owners and admins can manage the forwarding address."
          : friendlyDbError(error),
    };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "inbound_address.rotate",
    entityType: "inbound_address",
    diff: { hint: tokenHint(token) },
  });
  revalidateWorkspace();
  const { domain } = inboundConfig();
  return {
    ok: true,
    data: { token, address: domain ? formatAddress(token, domain) : null, hint: tokenHint(token) },
  };
}

export async function deleteInboundAddress(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_inbound_addresses")
    .delete()
    .eq("workspace_id", parsed.data.workspaceId)
    .select("workspace_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length)
    return { ok: false, error: "Only owners and admins can manage the forwarding address." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "inbound_address.delete",
    entityType: "inbound_address",
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
