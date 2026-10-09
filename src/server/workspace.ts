import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { parseBrand, type Brand } from "@/lib/brand";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/validation/settings";

import { requireUser, type SessionUser } from "./auth";

type BusinessType = Database["public"]["Enums"]["business_type"];

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  isDemo: boolean;
  brand: Brand;
  role: MemberRole;
};

export type WorkspaceContext = {
  user: SessionUser;
  workspace: WorkspaceSummary;
  role: MemberRole;
  canWrite: boolean;
  isAdmin: boolean;
  workspaces: WorkspaceSummary[];
};

/** Every workspace the user belongs to (RLS-scoped), cached for the request. */
export const getMyWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, slug, business_type, is_demo, brand)")
    .eq("user_id", user.id);
  if (error) throw error;

  const list: WorkspaceSummary[] = [];
  for (const row of data ?? []) {
    const w = row.workspaces;
    if (!w) continue;
    list.push({
      id: w.id,
      name: w.name,
      slug: w.slug,
      businessType: w.business_type,
      isDemo: w.is_demo,
      brand: parseBrand(w.brand),
      role: row.role,
    });
  }
  // Real businesses first, Demo last.
  return list.sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || a.name.localeCompare(b.name));
});

/** Resolve /w/[slug] for the signed-in member, or 404 (non-members can't tell it exists). */
export const getWorkspaceContext = cache(async (slug: string): Promise<WorkspaceContext> => {
  const user = await requireUser();
  const workspaces = await getMyWorkspaces();
  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) notFound();
  return {
    user,
    workspace,
    role: workspace.role,
    canWrite: workspace.role !== "viewer",
    isAdmin: workspace.role === "owner" || workspace.role === "admin",
    workspaces,
  };
});

export async function requireAdmin(slug: string): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext(slug);
  if (!ctx.isAdmin) redirect(`/w/${slug}/settings`);
  return ctx;
}
