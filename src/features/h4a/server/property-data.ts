"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { parseFieldSources, type FieldSources } from "@/lib/field-sources";
import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import {
  addressQuery,
  blankFieldPatch,
  pickRecord,
  propertyFacts,
  RENTCAST_SOURCE,
  RentCastClient,
  RentCastError,
  rentcastBaseUrl,
  rentcastPropertyType,
} from "../property-data/rentcast";

const saveSchema = z.object({
  workspaceId: z.uuid(),
  key: z.string().trim().min(16, "Paste the whole API key").max(200).optional(),
  monthlyLimit: z.coerce.number().int().min(0).max(100000),
});

/** Owner/admin: store the RentCast key (Vault) and/or the monthly request limit. No request is made. */
export async function saveDataApiKey(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.rpc("data_api_save_key", {
    p_workspace_id: parsed.data.workspaceId,
    p_key: (parsed.data.key ?? null) as string,
    p_monthly_limit: parsed.data.monthlyLimit,
  });
  if (error) return { ok: false, error: error.message || friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

export async function disconnectDataApi(input: { workspaceId: string }): Promise<ActionResult> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.rpc("data_api_disconnect", { p_workspace_id: ws.data });
  if (error) return { ok: false, error: error.message || friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const fetchSchema = z.object({
  workspaceId: z.uuid(),
  propertyId: z.uuid(),
  kind: z.enum(["record", "value", "rent"]),
});

export type FetchResult = {
  status: "found" | "not_found";
  filled: string[];
  used: number;
  limit: number;
};

/**
 * One request to RentCast for one property (counts against the monthly limit).
 * Property records fill only blank fields, stamped "RentCast" with the fetch time;
 * every answer is kept in property_data_pulls as the source behind what's shown.
 */
export async function fetchPropertyData(
  input: z.input<typeof fetchSchema>,
): Promise<ActionResult<FetchResult>> {
  const parsed = fetchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, propertyId, kind } = parsed.data;

  const { data: property, error: propError } = await ctx.supabase
    .from("properties")
    .select(
      "id, address, city, state, zip, units, last_sale_date, last_sale_price, assessed_value, year_built, building_sqft, lot_sqft, apn, county, field_sources",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (propError) return { ok: false, error: friendlyDbError(propError) };
  if (!property) return { ok: false, error: "Property not found." };
  if (!property.address?.trim())
    return { ok: false, error: "Add the property's street address first." };

  const { data: claim, error: claimError } = await ctx.supabase.rpc("data_api_claim", {
    p_workspace_id: workspaceId,
  });
  if (claimError) return { ok: false, error: claimError.message || friendlyDbError(claimError) };
  const access = claim?.[0];
  if (!access?.api_key) return { ok: false, error: "The property data service isn't connected." };

  const client = new RentCastClient(access.api_key, fetch, rentcastBaseUrl());
  const address = addressQuery(property);
  const type = rentcastPropertyType(property.units);
  const now = new Date().toISOString();

  const record = async (
    status: "found" | "not_found" | "error",
    payload: unknown,
    message?: string,
  ) => {
    const { data, error } = await ctx.supabase
      .from("property_data_pulls")
      .insert({
        workspace_id: workspaceId,
        property_id: propertyId,
        provider: "rentcast",
        kind,
        status,
        payload: payload === null ? null : toJson(payload),
        message: message?.slice(0, 500) ?? null,
        fetched_by: ctx.user.id,
        fetched_at: now,
      })
      .select("id")
      .single();
    if (error) console.error("property_data_pulls insert failed", { code: error.code });
    return data?.id ?? null;
  };

  try {
    let filled: string[] = [];
    if (kind === "record") {
      const records = await client.propertyRecords(address);
      const match = pickRecord(Array.isArray(records) ? records : [], property.zip);
      if (!match) {
        await record("not_found", null, "RentCast has no record for this address.");
        return {
          ok: true,
          data: { status: "not_found", filled, used: access.used + 1, limit: access.monthly_limit },
        };
      }
      const pullId = await record("found", match);
      const patch = blankFieldPatch(property, propertyFacts(match));
      filled = Object.keys(patch);
      if (filled.length) {
        const sources: FieldSources = { ...parseFieldSources(property.field_sources) };
        for (const f of filled)
          sources[f] = {
            source: "data_api",
            label: `${RENTCAST_SOURCE} property record`,
            url: null,
            fetched_at: now,
            user_id: ctx.user.id,
          };
        const { error } = await ctx.supabase
          .from("properties")
          .update({ ...patch, field_sources: toJson(sources) })
          .eq("workspace_id", workspaceId)
          .eq("id", propertyId);
        if (error) return { ok: false, error: friendlyDbError(error) };
      }
      await writeAudit(ctx.supabase, {
        workspaceId,
        actorId: ctx.user.id,
        action: "property.data_fetched",
        entityType: "property",
        entityId: propertyId,
        diff: { provider: "rentcast", kind, filled, pull_id: pullId },
      });
    } else {
      const answer =
        kind === "value"
          ? await client.valueEstimate(address, type)
          : await client.rentEstimate(address, type);
      await record("found", answer);
      await writeAudit(ctx.supabase, {
        workspaceId,
        actorId: ctx.user.id,
        action: "property.data_fetched",
        entityType: "property",
        entityId: propertyId,
        diff: { provider: "rentcast", kind },
      });
    }
    revalidateWorkspace();
    return {
      ok: true,
      data: { status: "found", filled, used: access.used + 1, limit: access.monthly_limit },
    };
  } catch (err) {
    if (err instanceof RentCastError) {
      if (err.kind === "not_found") {
        await record("not_found", null, err.message);
        revalidateWorkspace();
        return {
          ok: true,
          data: {
            status: "not_found",
            filled: [],
            used: access.used + 1,
            limit: access.monthly_limit,
          },
        };
      }
      await record("error", null, err.message);
      if (err.kind === "auth")
        await ctx.supabase.rpc("data_api_record_error", {
          p_workspace_id: workspaceId,
          p_message: err.message,
        });
      return { ok: false, error: err.message };
    }
    console.error("RentCast fetch failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "Something went wrong fetching property data." };
  }
}
