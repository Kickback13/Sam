import "server-only";

import { createClient } from "@/lib/supabase/server";

import type {
  RentCastProperty,
  RentCastRentEstimate,
  RentCastValueEstimate,
} from "../property-data/rentcast";

export type DataApiState = {
  connected: boolean;
  used: number;
  monthlyLimit: number;
  connectedAt: string | null;
  lastError: string | null;
};

/** The RentCast connection and this month's request count (never the key). */
export async function getDataApiState(workspaceId: string): Promise<DataApiState> {
  const supabase = await createClient();
  const [usage, row] = await Promise.all([
    supabase.rpc("data_api_usage", { p_workspace_id: workspaceId }),
    supabase
      .from("integrations")
      .select("status, connected_at, last_error")
      .eq("workspace_id", workspaceId)
      .eq("provider", "data_api")
      .maybeSingle(),
  ]);
  const u = usage.data?.[0];
  return {
    connected: Boolean(u?.connected),
    used: u?.used ?? 0,
    monthlyLimit: u?.monthly_limit ?? 0,
    connectedAt: row.data?.connected_at ?? null,
    lastError: row.data?.last_error ?? null,
  };
}

export type PropertyPulls = {
  record: { payload: RentCastProperty; fetchedAt: string } | null;
  value: { payload: RentCastValueEstimate; fetchedAt: string } | null;
  rent: { payload: RentCastRentEstimate; fetchedAt: string } | null;
  lastMiss: { kind: string; message: string | null; fetchedAt: string } | null;
};

/** The most recent successful answer of each kind for a property, plus the latest miss. */
export async function getPropertyPulls(
  workspaceId: string,
  propertyId: string,
): Promise<PropertyPulls> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_data_pulls")
    .select("kind, status, payload, message, fetched_at")
    .eq("workspace_id", workspaceId)
    .eq("property_id", propertyId)
    .order("fetched_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const out: PropertyPulls = { record: null, value: null, rent: null, lastMiss: null };
  for (const r of data ?? []) {
    if (r.status === "found") {
      const k = r.kind as "record" | "value" | "rent";
      if (!out[k]) (out[k] as unknown) = { payload: r.payload, fetchedAt: r.fetched_at };
    } else if (!out.lastMiss) {
      out.lastMiss = { kind: r.kind, message: r.message, fetchedAt: r.fetched_at };
    }
  }
  return out;
}
