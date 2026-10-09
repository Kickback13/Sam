import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BoardDeal = {
  id: string;
  title: string;
  stageId: string;
  position: number;
  value: number | null;
  units: number | null;
  status: "open" | "won" | "lost";
  expectedClose: string | null;
  stageEnteredAt: string;
  propertyLabel: string | null;
  contactName: string | null;
  assigneeName: string | null;
};

export async function getBoardDeals(workspaceId: string, pipelineId: string): Promise<BoardDeal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, title, stage_id, position, value, units, status, expected_close, stage_entered_at, property:properties!deals_workspace_id_property_id_fkey(name, address), contact:contacts!deals_workspace_id_primary_contact_id_fkey(full_name), assignee:profiles!deals_assigned_to_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipelineId)
    .is("deleted_at", null)
    .order("position")
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    stageId: d.stage_id,
    position: d.position,
    value: d.value,
    units: d.units,
    status: d.status,
    expectedClose: d.expected_close,
    stageEnteredAt: d.stage_entered_at,
    propertyLabel: d.property ? (d.property.name ?? d.property.address) : null,
    contactName: d.contact?.full_name ?? null,
    assigneeName: d.assignee?.full_name?.trim() || d.assignee?.email?.split("@")[0] || null,
  }));
}
