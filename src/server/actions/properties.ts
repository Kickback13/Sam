"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import {
  parseFieldSources,
  SOURCED_PROPERTY_FIELDS,
  stampManualSources,
} from "@/lib/field-sources";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { propertyInputSchema } from "@/lib/validation/property";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

const saveSchema = z.object({
  workspaceId: z.uuid(),
  propertyId: z.uuid().optional(),
  property: z.unknown(),
});

export async function saveProperty(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ id: string }>> {
  const envelope = saveSchema.safeParse(input);
  if (!envelope.success) return { ok: false, error: "Invalid request" };
  const parsed = propertyInputSchema.safeParse(envelope.data.property);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, propertyId } = envelope.data;
  const row = parsed.data;
  const user = { id: ctx.user.id, name: ctx.user.name };

  if (propertyId) {
    const { data: before } = await ctx.supabase
      .from("properties")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", propertyId)
      .maybeSingle();
    if (!before) return { ok: false, error: "Property not found." };
    // Trust layer: every changed value is stamped "Entered by {user}" with a timestamp.
    const field_sources = stampManualSources(
      parseFieldSources(before.field_sources),
      before as Record<string, unknown>,
      row as Record<string, unknown>,
      SOURCED_PROPERTY_FIELDS,
      user,
    );
    const { data, error } = await ctx.supabase
      .from("properties")
      .update({ ...row, field_sources: toJson(field_sources) })
      .eq("workspace_id", workspaceId)
      .eq("id", propertyId)
      .select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data?.length) return { ok: false, error: "You can't edit properties in this workspace." };
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "property.update",
      entityType: "property",
      entityId: propertyId,
      diff: diffFields(
        before as Record<string, unknown>,
        row as Record<string, unknown>,
        Object.keys(row),
      ),
    });
    revalidateWorkspace();
    return { ok: true, data: { id: propertyId } };
  }

  const field_sources = stampManualSources(
    {},
    {},
    row as Record<string, unknown>,
    SOURCED_PROPERTY_FIELDS,
    user,
  );
  const { data, error } = await ctx.supabase
    .from("properties")
    .insert({
      ...row,
      workspace_id: workspaceId,
      created_by: ctx.user.id,
      field_sources: toJson(field_sources),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "property.create",
    entityType: "property",
    entityId: data.id,
    diff: diffFields(null, row as Record<string, unknown>),
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function deleteProperty(input: {
  workspaceId: string;
  propertyId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), propertyId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("id", parsed.data.propertyId)
    .select("id, address");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete properties in this workspace." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "property.delete",
    entityType: "property",
    entityId: parsed.data.propertyId,
    diff: { address: data[0].address, soft_delete: true },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
