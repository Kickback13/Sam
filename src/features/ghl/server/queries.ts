import "server-only";

import { createClient, type ServerSupabase } from "@/lib/supabase/server";

import { GhlClient, GhlError, ghlBaseUrl, type GhlPipeline } from "../client";
import type { LocalStage } from "../map";

export async function loadLocalStages(
  workspaceId: string,
  supabase?: ServerSupabase,
): Promise<LocalStage[]> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("pipeline_stages")
    .select(
      "id, pipeline_id, name, is_won, is_lost, position, pipeline:pipelines!inner(name, position)",
    )
    .eq("workspace_id", workspaceId)
    .order("position");
  if (error) throw error;
  return (data ?? [])
    .map((s) => ({
      id: s.id,
      pipelineId: s.pipeline_id,
      pipelineName: s.pipeline?.name ?? "Pipeline",
      pipelinePosition: s.pipeline?.position ?? 0,
      name: s.name,
      isWon: s.is_won,
      isLost: s.is_lost,
      position: s.position,
    }))
    .sort((a, b) => a.pipelinePosition - b.pipelinePosition || a.position - b.position)
    .map(({ id, pipelineId, pipelineName, name, isWon, isLost }) => ({
      id,
      pipelineId,
      pipelineName,
      name,
      isWon,
      isLost,
    }));
}

export type GhlConnectionState = {
  status: "connected" | "not_connected" | "error";
  locationId: string | null;
  label: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export async function getGhlConnection(workspaceId: string): Promise<GhlConnectionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("status, config, connected_at, last_error")
    .eq("workspace_id", workspaceId)
    .eq("provider", "gohighlevel")
    .maybeSingle();
  if (error) throw error;
  const config = (data?.config ?? {}) as { location_id?: string; location_name?: string };
  return {
    status: data?.status ?? "not_connected",
    locationId: config.location_id ?? null,
    label: config.location_name || null,
    connectedAt: data?.connected_at ?? null,
    lastError: data?.last_error ?? null,
  };
}

/** Earlier GHL contact imports (they reuse the CSV import job table). */
export async function listGhlImports(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imports")
    .select("id, status, created_count, updated_count, skipped_count, error_count, created_at")
    .eq("workspace_id", workspaceId)
    .eq("filename", "GoHighLevel (API import)")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

export async function countGhlLinkedDeals(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("ghl_links")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("object", "opportunity");
  if (error) throw error;
  return count ?? 0;
}

/** GHL pipelines for the stage-mapping screen (owners/admins; token read from Vault). */
export async function fetchGhlPipelines(
  workspaceId: string,
): Promise<{ ok: true; pipelines: GhlPipeline[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ghl_connection", { p_workspace_id: workspaceId });
  if (error || !data?.[0]?.token || !data[0].location_id)
    return { ok: false, error: "GoHighLevel isn't connected for this workspace." };
  try {
    const client = new GhlClient(data[0].token, data[0].location_id, fetch, ghlBaseUrl());
    return { ok: true, pipelines: await client.getPipelines() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof GhlError ? err.message : "Couldn't load GoHighLevel pipelines.",
    };
  }
}

export async function defaultPipelineId(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();
  return data?.id ?? null;
}
