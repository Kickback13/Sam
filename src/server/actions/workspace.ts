"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/common";
import { getSessionUser } from "@/server/auth";

export type SearchHit = {
  entityType: "contact" | "company" | "property" | "deal";
  id: string;
  title: string;
  subtitle: string | null;
};

/** Remember the last workspace on the profile so it follows the user across devices. */
export async function rememberWorkspace(workspaceId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user || !z.uuid().safeParse(workspaceId).success) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ last_workspace_id: workspaceId }).eq("id", user.id);
}

export async function searchWorkspace(
  workspaceId: string,
  query: string,
): Promise<ActionResult<SearchHit[]>> {
  if (!z.uuid().safeParse(workspaceId).success) return { ok: false, error: "Invalid workspace" };
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", {
    p_workspace_id: workspaceId,
    p_query: q,
    p_limit: 6,
  });
  if (error) return { ok: false, error: "Search failed" };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      entityType: r.entity_type as SearchHit["entityType"],
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
    })),
  };
}
