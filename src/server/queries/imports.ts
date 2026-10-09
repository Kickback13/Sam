import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function listImports(workspaceId: string, limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imports")
    .select(
      "id, filename, status, total_rows, created_count, updated_count, skipped_count, error_count, created_at, completed_at, creator:profiles!imports_created_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getImport(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imports")
    .select("*, creator:profiles!imports_created_by_fkey(full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
