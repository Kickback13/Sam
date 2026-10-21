"use server";

import { z } from "zod";

import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { alertEmailConfig } from "../../alerts/email";
import { isSameListing } from "../../listing/dedupe";
import { listingKeys } from "../../listing/normalize";
import { listingFieldsSchema } from "../../listing/schema";
import { ingestAndScore, itemFromFields } from "../../pipeline/pipeline";
import { siteUrl } from "../config";
import { sessionStore, StoreError } from "../stores";

function storeErrorMessage(e: unknown): string {
  if (e instanceof StoreError) return friendlyDbError({ code: e.code, message: e.message });
  return "Something went wrong. Please try again.";
}

const saveSchema = z.object({
  workspaceId: z.uuid(),
  workspaceSlug: z.string().max(60),
  listingId: z.uuid().optional(),
  fields: z.unknown(),
});

/**
 * Manual entry (and manual corrections): every value is sourced "Entered by
 * <you>". Dedupe applies — if the building is already in the inbox, that
 * listing is updated instead of creating a duplicate.
 */
export async function saveManualListing(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ id: string; action: "created" | "updated" | "unchanged" }>> {
  const env = saveSchema.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = listingFieldsSchema.safeParse(env.data.fields);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, listingId, workspaceSlug } = env.data;

  try {
    const item = itemFromFields(parsed.data, "manual", { label: "Entered by" }, { listingId });
    const site = siteUrl();
    const out = await ingestAndScore(
      sessionStore(ctx.supabase, workspaceId),
      [item],
      alertEmailConfig(),
      site ? `${site}/w/${workspaceSlug}` : null,
    );
    const r = out.results[0];
    if (!r) return { ok: false, error: "Nothing was saved." };
    if (r.action === "error")
      return { ok: false, error: friendlyDbError({ code: r.code, message: r.error }) };
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: r.action === "created" ? "listing.create" : "listing.update",
      entityType: "listing",
      entityId: r.listing_id,
      diff: { origin: "manual", fields: parsed.data },
    });
    revalidateWorkspace();
    return { ok: true, data: { id: r.listing_id, action: r.action } };
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
}

const statusSchema = z.object({
  workspaceId: z.uuid(),
  listingId: z.uuid(),
  action: z.enum(["dismiss", "restore", "mark_reviewed", "needs_review"]),
  reason: z.string().trim().max(500).optional(),
});

export async function setListingStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ status: string }>> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  if (parsed.data.action === "dismiss" && !parsed.data.reason)
    return {
      ok: false,
      error: "Add a reason for dismissing this listing.",
      fieldErrors: { reason: ["Required"] },
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, listingId, action, reason } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("h4a_set_listing_status", {
    p_workspace_id: workspaceId,
    p_listing_id: listingId,
    p_action: action,
    p_reason: reason || undefined,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: `listing.${action}`,
    entityType: "listing",
    entityId: listingId,
    diff: { reason: reason ?? null, status: data },
  });
  revalidateWorkspace();
  return { ok: true, data: { status: data as string } };
}

const verifySchema = z.object({
  workspaceId: z.uuid(),
  listingId: z.uuid(),
  status: z.enum(["verified", "mismatch", "unverified"]),
  note: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(300).optional(),
});

/** "Mark verified" / "Mark mismatch": a note and where it was checked are required; saved with user + date. */
export async function verifyListing(input: z.input<typeof verifySchema>): Promise<ActionResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { workspaceId, listingId, status, note, source } = parsed.data;
  if (status !== "unverified") {
    const fieldErrors: Record<string, string[]> = {};
    if (!note) fieldErrors.note = ["Add what you checked"];
    if (!source) fieldErrors.source = ["Add where you checked it"];
    if (Object.keys(fieldErrors).length)
      return { ok: false, error: "Add a note and a source", fieldErrors };
  }
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { error } = await ctx.supabase.rpc("h4a_verify_listing", {
    p_workspace_id: workspaceId,
    p_listing_id: listingId,
    p_status: status,
    p_note: note || undefined,
    p_source: source || undefined,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: `listing.verification.${status}`,
    entityType: "listing",
    entityId: listingId,
    diff: { note: note ?? null, source: source ?? null },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const promoteSchema = z.object({ workspaceId: z.uuid(), listingId: z.uuid() });

/**
 * Promote to deal: link an existing Property for the same building (APN or
 * address) or create one with the listing's sourced fields, create a Deal in
 * New Deal on Acquisitions, log activities, link the listing to both.
 */
export async function promoteListing(
  input: z.input<typeof promoteSchema>,
): Promise<
  ActionResult<{ dealId: string; propertyId: string; propertyCreated: boolean; already: boolean }>
> {
  const parsed = promoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, listingId } = parsed.data;

  const { data: listing } = await ctx.supabase
    .from("h4a_listings")
    .select("id, address, city, zip, apn, apn_key, match_keys, property_id")
    .eq("workspace_id", workspaceId)
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { ok: false, error: "Listing not found." };

  let propertyId: string | null = listing.property_id;
  if (!propertyId) {
    const streetNo = listing.address.match(/^\d+/)?.[0];
    const last4 = listing.apn_key?.slice(-4);
    const ors = [
      streetNo ? `address.ilike.${streetNo}*` : null,
      last4 ? `apn.ilike.*${last4}*` : null,
    ].filter(Boolean);
    if (ors.length) {
      const { data: props } = await ctx.supabase
        .from("properties")
        .select("id, address, city, zip, apn")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .or(ors.join(","))
        .limit(100);
      const mine = { apnKey: listing.apn_key, matchKeys: listing.match_keys };
      const match = (props ?? []).find((p) => {
        const k = listingKeys(p);
        return isSameListing(mine, { apnKey: k.apnKey, matchKeys: k.matchKeys });
      });
      propertyId = match?.id ?? null;
    }
  }

  const { data, error } = await ctx.supabase.rpc("h4a_promote_listing", {
    p_workspace_id: workspaceId,
    p_listing_id: listingId,
    p_property_id: propertyId ?? undefined,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const res = data as {
    deal_id: string;
    property_id: string;
    property_created?: boolean;
    already?: boolean;
  };
  if (!res.already)
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "listing.promote",
      entityType: "listing",
      entityId: listingId,
      diff: res,
    });
  revalidateWorkspace();
  return {
    ok: true,
    data: {
      dealId: res.deal_id,
      propertyId: res.property_id,
      propertyCreated: Boolean(res.property_created),
      already: Boolean(res.already),
    },
  };
}

const readSchema = z.object({
  workspaceId: z.uuid(),
  alertIds: z.array(z.uuid()).max(500).optional(),
});

export async function markAlertsRead(
  input: z.input<typeof readSchema>,
): Promise<ActionResult<{ count: number }>> {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("h4a_mark_alerts_read", {
    p_workspace_id: parsed.data.workspaceId,
    p_alert_ids: parsed.data.alertIds,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: { count: (data as number) ?? 0 } };
}
