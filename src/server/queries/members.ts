import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/validation/settings";

export type MemberRow = {
  userId: string;
  role: MemberRole;
  name: string;
  email: string | null;
  joinedAt: string;
};

export const getMembers = cache(async (workspaceId: string): Promise<MemberRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, created_at, profiles(full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    name: m.profiles?.full_name?.trim() || m.profiles?.email?.split("@")[0] || "Member",
    email: m.profiles?.email ?? null,
    joinedAt: m.created_at,
  }));
});

export const getWorkspaceCounts = cache(async (workspaceId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("workspace_counts", { p_workspace_id: workspaceId });
  const counts = (data ?? {}) as Record<string, number>;
  return {
    contacts: counts.contacts ?? 0,
    companies: counts.companies ?? 0,
    properties: counts.properties ?? 0,
    open_deals: counts.open_deals ?? 0,
    my_open_tasks: counts.my_open_tasks ?? 0,
    my_overdue_tasks: counts.my_overdue_tasks ?? 0,
  };
});
