"use server";

import { z } from "zod";

import { brandContrastIssues } from "@/lib/brand";
import { toJson } from "@/lib/db/json";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import {
  inviteInputSchema,
  memberRoleSchema,
  stageInputSchema,
  stageUpdateSchema,
  workspaceBrandSchema,
  workspaceProfileSchema,
} from "@/lib/validation/settings";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { diffFields, writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";
import { requestOrigin } from "@/server/origin";

const NO_ADMIN = "Only workspace admins can change settings.";

export async function updateWorkspaceProfile(
  input: z.input<typeof workspaceProfileSchema>,
): Promise<ActionResult> {
  const parsed = workspaceProfileSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, name, owner_email, ...profileFields } = parsed.data;

  const { data: before } = await ctx.supabase
    .from("workspaces")
    .select("name, profile, owner_email")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Workspace not found." };
  const profile = { ...((before.profile as Record<string, unknown>) ?? {}), ...profileFields };
  const { data, error } = await ctx.supabase
    .from("workspaces")
    .update({ name, owner_email, profile: toJson(profile) })
    .eq("id", workspaceId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "workspace.update",
    entityType: "workspace",
    entityId: workspaceId,
    diff: diffFields(
      { name: before.name, owner_email: before.owner_email, ...(before.profile as object) },
      { name, owner_email, ...profileFields },
    ),
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function updateBranding(
  input: z.input<typeof workspaceBrandSchema>,
): Promise<ActionResult> {
  const parsed = workspaceBrandSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check the colors", fieldErrors: zodFieldErrors(parsed.error) };
  const issues = brandContrastIssues(parsed.data.brand);
  if (issues.length) return { ok: false, error: `Fails WCAG AA: ${issues.join("; ")}` };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, brand } = parsed.data;
  const { data: before } = await ctx.supabase
    .from("workspaces")
    .select("brand")
    .eq("id", workspaceId)
    .maybeSingle();
  const { data, error } = await ctx.supabase
    .from("workspaces")
    .update({ brand: toJson(brand) })
    .eq("id", workspaceId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "workspace.branding",
    entityType: "workspace",
    entityId: workspaceId,
    diff: diffFields((before?.brand as Record<string, unknown>) ?? {}, brand),
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

// --- Members & invites --------------------------------------------------------

export async function createInvite(
  input: z.input<typeof inviteInputSchema>,
): Promise<ActionResult<{ url: string }>> {
  const parsed = inviteInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check the form", fieldErrors: zodFieldErrors(parsed.error) };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, email, role } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("invites")
    .insert({
      workspace_id: workspaceId,
      email: email?.toLowerCase() ?? null,
      role,
      invited_by: ctx.user.id,
    })
    .select("id, token")
    .single();
  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        error:
          role === "owner"
            ? "Only an owner can invite another owner (or an admin, while the workspace has no owner yet)."
            : NO_ADMIN,
      };
    }
    return { ok: false, error: friendlyDbError(error) };
  }
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "invite.create",
    entityType: "invite",
    entityId: data.id,
    diff: { email, role },
  });
  revalidateWorkspace();
  return { ok: true, data: { url: `${await requestOrigin()}/invite/${data.token}` } };
}

export async function revokeInvite(input: {
  workspaceId: string;
  inviteId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), inviteId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("id", parsed.data.inviteId)
    .is("accepted_at", null)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "That invite can't be revoked." };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "invite.revoke",
    entityType: "invite",
    entityId: parsed.data.inviteId,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function updateMemberRole(
  input: z.input<typeof memberRoleSchema>,
): Promise<ActionResult> {
  const parsed = memberRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, userId, role } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "member.role",
    entityType: "member",
    entityId: userId,
    diff: { role },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function removeMember(input: {
  workspaceId: string;
  userId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "member.remove",
    entityType: "member",
    entityId: parsed.data.userId,
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

// --- Pipelines & stages ---------------------------------------------------------

export async function createPipeline(input: {
  workspaceId: string;
  name: string;
  kind: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({
      workspaceId: z.uuid(),
      name: z.string().trim().min(1).max(80),
      kind: z.enum(["acquisition", "disposition", "construction_project"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the pipeline a name" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, name, kind } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("pipelines")
    .insert({ workspace_id: workspaceId, name, kind, position: 100 })
    .select("id")
    .single();
  if (error)
    return { ok: false, error: error.code === "42501" ? NO_ADMIN : friendlyDbError(error) };
  await ctx.supabase.from("pipeline_stages").insert([
    {
      workspace_id: workspaceId,
      pipeline_id: data.id,
      name: "New",
      position: 1,
      color: "#64748B",
      probability: 10,
    },
    {
      workspace_id: workspaceId,
      pipeline_id: data.id,
      name: "Won",
      position: 2,
      color: "#16A34A",
      probability: 100,
      is_won: true,
    },
    {
      workspace_id: workspaceId,
      pipeline_id: data.id,
      name: "Lost",
      position: 3,
      color: "#DC2626",
      probability: 0,
      is_lost: true,
    },
  ]);
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "pipeline.create",
    entityType: "pipeline",
    entityId: data.id,
    diff: { name, kind },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function renamePipeline(input: {
  workspaceId: string;
  pipelineId: string;
  name: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workspaceId: z.uuid(), pipelineId: z.uuid(), name: z.string().trim().min(1).max(80) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the pipeline a name" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("pipelines")
    .update({ name: parsed.data.name })
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("id", parsed.data.pipelineId)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "pipeline.rename",
    entityType: "pipeline",
    entityId: parsed.data.pipelineId,
    diff: { name: parsed.data.name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function saveStage(
  input: z.input<typeof stageUpdateSchema> | z.input<typeof stageInputSchema>,
): Promise<ActionResult> {
  const isUpdate = "stageId" in input && Boolean(input.stageId);
  const parsed = (isUpdate ? stageUpdateSchema : stageInputSchema).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check the stage", fieldErrors: zodFieldErrors(parsed.error) };
  const s = parsed.data as z.infer<typeof stageUpdateSchema>;
  if (s.is_won && s.is_lost) return { ok: false, error: "A stage can't be both won and lost." };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const fields = {
    name: s.name,
    color: s.color.toUpperCase(),
    probability: s.probability,
    is_won: s.is_won,
    is_lost: s.is_lost,
  };

  if (isUpdate) {
    const { data, error } = await ctx.supabase
      .from("pipeline_stages")
      .update(fields)
      .eq("workspace_id", s.workspaceId)
      .eq("id", s.stageId)
      .select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data?.length) return { ok: false, error: NO_ADMIN };
    await writeAudit(ctx.supabase, {
      workspaceId: s.workspaceId,
      actorId: ctx.user.id,
      action: "stage.update",
      entityType: "stage",
      entityId: s.stageId,
      diff: fields,
    });
  } else {
    const { data: last } = await ctx.supabase
      .from("pipeline_stages")
      .select("position")
      .eq("pipeline_id", s.pipelineId)
      .order("position", { ascending: false })
      .limit(1);
    const { data, error } = await ctx.supabase
      .from("pipeline_stages")
      .insert({
        ...fields,
        workspace_id: s.workspaceId,
        pipeline_id: s.pipelineId,
        position: (last?.[0]?.position ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error)
      return { ok: false, error: error.code === "42501" ? NO_ADMIN : friendlyDbError(error) };
    await writeAudit(ctx.supabase, {
      workspaceId: s.workspaceId,
      actorId: ctx.user.id,
      action: "stage.create",
      entityType: "stage",
      entityId: data.id,
      diff: fields,
    });
  }
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function deleteStage(input: {
  workspaceId: string;
  stageId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), stageId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, stageId } = parsed.data;
  const { count } = await ctx.supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("stage_id", stageId);
  if (count && count > 0)
    return {
      ok: false,
      error: `This stage still holds ${count} deal${count === 1 ? "" : "s"}. Move them first.`,
    };
  const { data, error } = await ctx.supabase
    .from("pipeline_stages")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", stageId)
    .select("id, name");
  if (error)
    return {
      ok: false,
      error:
        error.code === "23503"
          ? "This stage still holds deals (including deleted ones). Move them first."
          : friendlyDbError(error),
    };
  if (!data?.length) return { ok: false, error: NO_ADMIN };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "stage.delete",
    entityType: "stage",
    entityId: stageId,
    diff: { name: data[0].name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function reorderStages(input: {
  workspaceId: string;
  pipelineId: string;
  stageIds: string[];
}): Promise<ActionResult> {
  const parsed = z
    .object({
      workspaceId: z.uuid(),
      pipelineId: z.uuid(),
      stageIds: z.array(z.uuid()).min(1).max(50),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.rpc("reorder_stages", {
    p_pipeline_id: parsed.data.pipelineId,
    p_stage_ids: parsed.data.stageIds,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: parsed.data.workspaceId,
    actorId: ctx.user.id,
    action: "stage.reorder",
    entityType: "pipeline",
    entityId: parsed.data.pipelineId,
    diff: { order: parsed.data.stageIds },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
