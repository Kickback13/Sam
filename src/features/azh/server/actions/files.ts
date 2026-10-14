"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { FILE_TYPES, MAX_FILE_BYTES } from "../../constants";
import { FILE_PATH_RE } from "../../files";

const registerSchema = z
  .object({
    workspaceId: z.uuid(),
    dealId: z.uuid().nullish(),
    requestId: z.uuid().nullish(),
    path: z.string().regex(FILE_PATH_RE),
    name: z.string().trim().min(1).max(200),
    mimeType: z.string().refine((t) => t in FILE_TYPES, "File type not allowed"),
    size: z.number().int().min(1).max(MAX_FILE_BYTES),
    kind: z.enum(["photo", "document", "receipt"]),
  })
  .refine((v) => Boolean(v.dealId) !== Boolean(v.requestId), "Attach to a project or a request");

/** Record metadata for an object the browser just uploaded to azh-files (RLS checks the workspace). */
export async function registerFile(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file" };
  const v = parsed.data;
  if (!v.path.startsWith(`${v.workspaceId}/`)) return { ok: false, error: "Invalid file path" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  // The object must exist (and be readable by this user) before we point at it.
  const folder = v.path.slice(0, v.path.lastIndexOf("/"));
  const { data: listed } = await ctx.supabase.storage.from("azh-files").list(folder, { limit: 10 });
  if (!listed?.some((o) => `${folder}/${o.name}` === v.path))
    return { ok: false, error: "The upload didn't finish. Try again." };

  const { data, error } = await ctx.supabase
    .from("azh_files")
    .insert({
      workspace_id: v.workspaceId,
      deal_id: v.dealId ?? null,
      request_id: v.requestId ?? null,
      path: v.path,
      name: v.name,
      mime_type: v.mimeType,
      size_bytes: v.size,
      kind: v.kind,
      uploaded_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) {
    await ctx.supabase.storage.from("azh-files").remove([v.path]);
    return { ok: false, error: friendlyDbError(error) };
  }
  await writeAudit(ctx.supabase, {
    workspaceId: v.workspaceId,
    actorId: ctx.user.id,
    action: "azh_file.upload",
    entityType: "azh_file",
    entityId: data.id,
    diff: {
      name: v.name,
      size: v.size,
      deal_id: v.dealId ?? null,
      request_id: v.requestId ?? null,
    },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function deleteFile(input: {
  workspaceId: string;
  fileId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: z.uuid(), fileId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, fileId } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("azh_files")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", fileId)
    .select("path, name");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "You can't delete files in this workspace." };
  const { error: storageError } = await ctx.supabase.storage
    .from("azh-files")
    .remove([data[0].path]);
  if (storageError) console.error("azh-files remove failed", { message: storageError.message });
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "azh_file.delete",
    entityType: "azh_file",
    entityId: fileId,
    diff: { name: data[0].name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}
