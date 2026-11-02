"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import {
  commentSchema,
  eventSchema,
  inviteSchema,
  memberAdminSchema,
  postSchema,
  profileSchema,
} from "../schema";

type DbError = { code?: string; message?: string } | null;
const dbError = (e: DbError, denied: string) =>
  e?.code === "42501"
    ? denied
    : e?.code === "22023"
      ? (e.message ?? "That isn't valid.")
      : friendlyDbError(e);

function refresh() {
  revalidatePath("/n/[slug]", "layout");
  revalidateWorkspace();
}

const wsId = z.uuid();
const ids = z.object({ workspaceId: z.uuid(), id: z.uuid() });

// ---------------------------------------------------------------------------
// Invites + joining
// ---------------------------------------------------------------------------
export async function createNetworkInvite(input: {
  workspaceId: string;
  values: unknown;
}): Promise<ActionResult<{ token: string }>> {
  const workspaceId = wsId.safeParse(input.workspaceId);
  const parsed = inviteSchema.safeParse(input.values);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_invites")
    .insert({ workspace_id: workspaceId.data, ...parsed.data })
    .select("id, token")
    .single();
  if (error || !data) return { ok: false, error: dbError(error, "Viewers can't invite people.") };
  await writeAudit(ctx.supabase, {
    workspaceId: workspaceId.data,
    actorId: ctx.user.id,
    action: "network.invited",
    entityType: "network_invite",
    entityId: data.id,
    diff: { email: parsed.data.email, member_type: parsed.data.member_type },
  });
  refresh();
  return { ok: true, data: { token: data.token } };
}

export async function revokeNetworkInvite(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase
    .from("network_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id);
  if (error) return { ok: false, error: dbError(error, "Viewers can't revoke invites.") };
  refresh();
  return { ok: true, data: undefined };
}

export async function joinNetwork(input: {
  token: string;
  displayName: string;
}): Promise<ActionResult<{ slug: string }>> {
  const env = z
    .object({
      token: z.string().regex(/^[0-9a-f]{16,128}$/),
      displayName: z.string().trim().max(120),
    })
    .safeParse(input);
  if (!env.success) return { ok: false, error: "That invite link isn't valid." };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("accept_network_invite", {
    p_token: env.data.token,
    p_display_name: env.data.displayName,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't join." };
  refresh();
  return { ok: true, data: { slug: data } };
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------
export async function createPost(input: {
  workspaceId: string;
  values: unknown;
  pinned?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const workspaceId = wsId.safeParse(input.workspaceId);
  const parsed = postSchema.safeParse(input.values);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  // Authorship and pinning are enforced by the database trigger.
  const { data, error } = await ctx.supabase
    .from("network_posts")
    .insert({ workspace_id: workspaceId.data, ...parsed.data, pinned: Boolean(input.pinned) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: dbError(error, "You can't post here.") };
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function deletePost(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_posts")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id");
  if (error) return { ok: false, error: dbError(error, "You can only delete your own posts.") };
  if (!data?.length) return { ok: false, error: "You can only delete your own posts." };
  refresh();
  return { ok: true, data: undefined };
}

/** Staff moderation: hide/unhide and pin/unpin. */
export async function moderatePost(input: {
  workspaceId: string;
  id: string;
  hidden?: boolean;
  pinned?: boolean;
}): Promise<ActionResult> {
  const env = ids
    .extend({ hidden: z.boolean().optional(), pinned: z.boolean().optional() })
    .safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const patch: { hidden_at?: string | null; hidden_by?: string | null; pinned?: boolean } = {};
  if (env.data.hidden !== undefined) {
    patch.hidden_at = env.data.hidden ? new Date().toISOString() : null;
    patch.hidden_by = env.data.hidden ? ctx.user.id : null;
  }
  if (env.data.pinned !== undefined) patch.pinned = env.data.pinned;
  const { data, error } = await ctx.supabase
    .from("network_posts")
    .update(patch)
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id");
  if (error) return { ok: false, error: dbError(error, "Only the team can moderate posts.") };
  if (!data?.length) return { ok: false, error: "Only the team can moderate posts." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "network.post_moderated",
    entityType: "network_post",
    entityId: env.data.id,
    diff: patch,
  });
  refresh();
  return { ok: true, data: undefined };
}

export async function addComment(input: {
  workspaceId: string;
  postId: string;
  values: unknown;
}): Promise<ActionResult> {
  const env = z.object({ workspaceId: z.uuid(), postId: z.uuid() }).safeParse(input);
  const parsed = commentSchema.safeParse(input.values);
  if (!env.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.from("network_comments").insert({
    workspace_id: env.data.workspaceId,
    post_id: env.data.postId,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: dbError(error, "You can't comment on this post.") };
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteComment(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_comments")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "You can only delete your own comments." };
  refresh();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export async function createEvent(input: {
  workspaceId: string;
  values: unknown;
}): Promise<ActionResult<{ id: string }>> {
  const workspaceId = wsId.safeParse(input.workspaceId);
  const parsed = eventSchema.safeParse(input.values);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_events")
    .insert({ workspace_id: workspaceId.data, ...parsed.data })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: dbError(error, "Only the team can create events.") };
  await writeAudit(ctx.supabase, {
    workspaceId: workspaceId.data,
    actorId: ctx.user.id,
    action: "network.event_created",
    entityType: "network_event",
    entityId: data.id,
    diff: { title: parsed.data.title, starts_at: parsed.data.starts_at },
  });
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function cancelEvent(input: {
  workspaceId: string;
  id: string;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_events")
    .update({ canceled_at: new Date().toISOString() })
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id");
  if (error || !data?.length)
    return { ok: false, error: dbError(error, "Only the team can cancel events.") };
  refresh();
  return { ok: true, data: undefined };
}

export async function setRsvp(input: {
  workspaceId: string;
  eventId: string;
  status: "going" | "not_going";
}): Promise<ActionResult> {
  const env = z
    .object({ workspaceId: z.uuid(), eventId: z.uuid(), status: z.enum(["going", "not_going"]) })
    .safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.from("network_rsvps").upsert(
    {
      workspace_id: env.data.workspaceId,
      event_id: env.data.eventId,
      user_id: ctx.user.id,
      status: env.data.status,
    },
    { onConflict: "event_id,user_id" },
  );
  if (error) return { ok: false, error: dbError(error, "You can't RSVP to this event.") };
  refresh();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
export async function updateMyProfile(input: {
  workspaceId: string;
  values: unknown;
}): Promise<ActionResult> {
  const workspaceId = wsId.safeParse(input.workspaceId);
  const parsed = profileSchema.safeParse(input.values);
  if (!workspaceId.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_members")
    .update(parsed.data)
    .eq("workspace_id", workspaceId.data)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error || !data?.length)
    return { ok: false, error: dbError(error, "Couldn't save your profile.") };
  refresh();
  return { ok: true, data: undefined };
}

/** Staff: member type, segments (tags) and remove/restore. */
export async function updateMemberAdmin(input: {
  workspaceId: string;
  id: string;
  values: unknown;
}): Promise<ActionResult> {
  const env = ids.safeParse(input);
  const parsed = memberAdminSchema.safeParse(input.values);
  if (!env.success) return { ok: false, error: "Invalid request" };
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("network_members")
    .update(parsed.data)
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id");
  if (error || !data?.length)
    return { ok: false, error: dbError(error, "Viewers can't change members.") };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "network.member_updated",
    entityType: "network_member",
    entityId: env.data.id,
    diff: parsed.data,
  });
  refresh();
  return { ok: true, data: undefined };
}
