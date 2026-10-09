import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Stage = {
  id: string;
  name: string;
  position: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  probability: number;
};

export type Pipeline = {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  stages: Stage[];
};

export const getPipelines = cache(async (workspaceId: string): Promise<Pipeline[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipelines")
    .select(
      "id, name, kind, is_default, position, pipeline_stages(id, name, position, color, is_won, is_lost, probability)",
    )
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("position");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    isDefault: p.is_default,
    stages: [...(p.pipeline_stages ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        color: s.color,
        isWon: s.is_won,
        isLost: s.is_lost,
        probability: s.probability,
      })),
  }));
});

export type StageTotal = Stage & { dealCount: number; totalValue: number };

export async function getStageTotals(pipeline: Pipeline): Promise<StageTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_stage_totals", {
    p_pipeline_id: pipeline.id,
  });
  if (error) throw error;
  const byId = new Map((data ?? []).map((r) => [r.stage_id, r]));
  return pipeline.stages.map((s) => ({
    ...s,
    dealCount: Number(byId.get(s.id)?.deal_count ?? 0),
    totalValue: Number(byId.get(s.id)?.total_value ?? 0),
  }));
}
