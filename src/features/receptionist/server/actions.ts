"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { normalizePhone } from "@/lib/normalize";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { DAYS } from "../routing";

const ADMIN_ONLY = "Only an owner or admin can change the receptionist.";
const denied = (e: { code?: string } | null) =>
  e?.code === "42501" ? ADMIN_ONLY : friendlyDbError(e);

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const hoursSchema = z
  .record(z.string(), z.array(z.tuple([TIME, TIME])).max(4))
  .refine((h) => Object.keys(h).every((k) => DAYS.some((d) => d.key === k)), "Unknown day")
  .refine(
    (h) => Object.values(h).every((rs) => rs.every(([a, b]) => a < b)),
    "Closing time must be after opening time",
  );

const settingsSchema = z.object({
  enabled: z.boolean(),
  ring_seconds: z.coerce.number().int().min(5).max(60),
  time_zone: z.enum([
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Anchorage",
    "Pacific/Honolulu",
  ]),
  hours: hoursSchema,
  greeting_en: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
  greeting_es: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
});

export async function saveReceptionistSettings(input: {
  workspaceId: string;
  values: unknown;
}): Promise<ActionResult> {
  const ws = z.uuid().safeParse(input.workspaceId);
  const parsed = settingsSchema.safeParse(input.values);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.from("receptionist_settings").upsert({
    workspace_id: ws.data,
    ...parsed.data,
    hours: toJson(parsed.data.hours),
    updated_by: ctx.user.id,
  });
  if (error) return { ok: false, error: denied(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: ws.data,
    actorId: ctx.user.id,
    action: "receptionist.settings_updated",
    entityType: "receptionist",
    diff: { enabled: parsed.data.enabled, ring_seconds: parsed.data.ring_seconds },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const routeSchema = z.object({
  name: z.string().trim().min(1, "Add a name").max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null),
  forward_to: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? normalizePhone(v) : null))
    .refine(
      (v) => v === null || /^\+[1-9]\d{7,14}$/.test(v),
      "Enter a full phone number, e.g. (619) 555-0100",
    ),
  keywords: z
    .array(z.string().trim().min(1).max(40))
    .max(40)
    .transform((k) => [...new Set(k.map((x) => x.toLowerCase()))]),
  languages: z.array(z.enum(["en", "es"])).min(1, "Pick at least one language"),
  assignee_user_id: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  is_default: z.boolean(),
  active: z.boolean(),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function saveRoute(input: {
  workspaceId: string;
  id?: string | null;
  values: unknown;
}): Promise<ActionResult<{ id: string }>> {
  const env = z.object({ workspaceId: z.uuid(), id: z.uuid().nullish() }).safeParse(input);
  const parsed = routeSchema.safeParse(input.values);
  if (!env.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, id } = env.data;
  const values = { ...parsed.data };
  if (!id) {
    // Decided here, not from the page (which can be stale): the first route becomes the
    // default, and a new route goes to the end of the list.
    const { data: existing, error } = await ctx.supabase
      .from("receptionist_routes")
      .select("position, is_default")
      .eq("workspace_id", workspaceId);
    if (error) return { ok: false, error: denied(error) };
    if (!existing?.some((r) => r.is_default)) values.is_default = true;
    values.position = existing?.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
  }
  // Only one default route: clear the old one first.
  if (values.is_default) {
    const { error } = await ctx.supabase
      .from("receptionist_routes")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
    if (error) return { ok: false, error: denied(error) };
  }
  const result = id
    ? await ctx.supabase
        .from("receptionist_routes")
        .update(values)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id")
        .single()
    : await ctx.supabase
        .from("receptionist_routes")
        .insert({ workspace_id: workspaceId, ...values })
        .select("id")
        .single();
  if (result.error || !result.data) return { ok: false, error: denied(result.error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: id ? "receptionist.route_updated" : "receptionist.route_created",
    entityType: "receptionist_route",
    entityId: result.data.id,
    diff: {
      name: parsed.data.name,
      forward_to: parsed.data.forward_to,
      is_default: parsed.data.is_default,
    },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: result.data.id } };
}

export async function deleteRoute(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = z.object({ workspaceId: z.uuid(), id: z.uuid() }).safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("receptionist_routes")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("name");
  if (error || !data?.length) return { ok: false, error: error ? denied(error) : ADMIN_ONLY };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "receptionist.route_deleted",
    entityType: "receptionist_route",
    entityId: env.data.id,
    diff: { name: data[0].name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/** New webhook token (replaces the old one). Returned once — the URLs are built in the browser. */
export async function createReceptionistToken(input: {
  workspaceId: string;
}): Promise<ActionResult<{ token: string }>> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("receptionist_create_token", {
    p_workspace_id: ws.data,
  });
  if (error || !data) return { ok: false, error: denied(error) };
  revalidateWorkspace();
  return { ok: true, data: { token: data } };
}
