import "server-only";

import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/server/queries/contacts";

import type { ListingStatus, ScoreBand } from "../constants";
import { isBuyBoxEmpty } from "../scoring/score";
import { loadBuyBox } from "./rescore";

export const LISTINGS_PAGE_SIZE = 50;

export type ListingFilters = {
  status?: "open" | "all" | ListingStatus;
  band?: ScoreBand;
  origin?: string;
  zip?: string;
  verification?: "unverified" | "verified" | "mismatch";
  q?: string;
  sort?: "score" | "newest";
  page?: number;
};

const LIST_COLUMNS =
  "id, status, origin, source_label, address, city, zip, price, units, price_per_unit, cap_rate, year_built, score, scored_buy_box_version, received_at, last_received_at, verification_status, field_sources, review_reasons, parse_confidence, deal_id, property_id";

export async function listListings(workspaceId: string, f: ListingFilters) {
  const supabase = await createClient();
  let q = supabase
    .from("h4a_listings")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("workspace_id", workspaceId);
  const status = f.status ?? "open";
  if (status === "open") q = q.in("status", ["new", "needs_review"]);
  else if (status !== "all") q = q.eq("status", status);
  if (f.band === "high") q = q.gte("score", 70);
  else if (f.band === "medium") q = q.gte("score", 40).lt("score", 70);
  else if (f.band === "low") q = q.lt("score", 40);
  else if (f.band === "unscored") q = q.is("score", null);
  if (f.origin) q = q.eq("origin", f.origin);
  if (f.zip) q = q.like("zip", `${escapeLike(f.zip)}%`);
  if (f.verification) q = q.eq("verification_status", f.verification);
  const term = f.q?.trim().toLowerCase();
  if (term) q = q.like("search_text", `%${escapeLike(term)}%`);
  if (f.sort === "newest") q = q.order("received_at", { ascending: false });
  else
    q = q
      .order("score", { ascending: false, nullsFirst: false })
      .order("received_at", { ascending: false });
  const page = Math.max(1, f.page ?? 1);
  const from = (page - 1) * LISTINGS_PAGE_SIZE;
  const { data, error, count } = await q.order("id").range(from, from + LISTINGS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
export type ListingRow = Awaited<ReturnType<typeof listListings>>["rows"][number];

/** ZIPs present in the inbox (for the ZIP filter). */
export async function listingZips(workspaceId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("h4a_listings")
    .select("zip")
    .eq("workspace_id", workspaceId)
    .not("zip", "is", null)
    .limit(2000);
  return [...new Set((data ?? []).map((r) => (r.zip ?? "").slice(0, 5)).filter(Boolean))].sort();
}

export async function getListing(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_listings")
    .select(
      "*, property:properties!h4a_listings_workspace_id_property_id_fkey(id, name, address), deal:deals!h4a_listings_workspace_id_deal_id_fkey(id, title, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey(name, color)), verifier:profiles!h4a_listings_verified_by_fkey(full_name, email), dismisser:profiles!h4a_listings_dismissed_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListing>>>;

export async function getListingEvents(workspaceId: string, listingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_listing_events")
    .select(
      "id, kind, origin, source_label, email_id, summary, changes, created_at, actor:profiles!h4a_listing_events_actor_id_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}
export type ListingEvent = Awaited<ReturnType<typeof getListingEvents>>[number];

const EMAIL_COLUMNS =
  "id, channel, from_address, subject, received_at, text_body, html_body, body_status, parse_status, parser_key, parser_label, confidence, listing_count, parse_notes, error";

/** Emails that created or updated this listing, newest first. */
export async function getListingEmails(workspaceId: string, emailIds: string[]) {
  if (emailIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_inbound_emails")
    .select(EMAIL_COLUMNS)
    .eq("workspace_id", workspaceId)
    .in("id", [...new Set(emailIds)].slice(0, 20))
    .order("received_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export type InboundEmailRow = Awaited<ReturnType<typeof getListingEmails>>[number];

export async function listInboundEmails(workspaceId: string, page = 1) {
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * LISTINGS_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("h4a_inbound_emails")
    .select(
      "id, channel, from_address, subject, received_at, parse_status, parser_label, confidence, listing_count, error, parse_notes",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .order("received_at", { ascending: false })
    .range(from, from + LISTINGS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getInboundEmail(workspaceId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_inbound_emails")
    .select(EMAIL_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: events } = await supabase
    .from("h4a_listing_events")
    .select("listing_id, kind")
    .eq("workspace_id", workspaceId)
    .eq("email_id", id);
  const ids = [...new Set((events ?? []).map((e) => e.listing_id))];
  const { data: listings } = ids.length
    ? await supabase
        .from("h4a_listings")
        .select("id, address, city, zip, price, units, score, status")
        .eq("workspace_id", workspaceId)
        .in("id", ids)
    : { data: [] };
  return { email: data, listings: listings ?? [] };
}

export async function getListingAlert(workspaceId: string, listingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("h4a_alerts")
    .select("id, score, threshold, created_at, read_at, email_status, email_error")
    .eq("workspace_id", workspaceId)
    .eq("listing_id", listingId)
    .maybeSingle();
  return data;
}

export async function listAlerts(
  workspaceId: string,
  opts: { unread?: boolean; page?: number } = {},
) {
  const supabase = await createClient();
  const from = (Math.max(1, opts.page ?? 1) - 1) * LISTINGS_PAGE_SIZE;
  let q = supabase
    .from("h4a_alerts")
    .select(
      "id, score, threshold, reason, created_at, read_at, email_status, listing:h4a_listings!h4a_alerts_workspace_id_listing_id_fkey(id, address, city, zip, price, units, price_per_unit, score, status, source_label, verification_status, received_at)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);
  if (opts.unread) q = q.is("read_at", null);
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, from + LISTINGS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function unreadAlertCount(workspaceId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("h4a_alerts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("read_at", null);
  return count ?? 0;
}

export async function getBuyBoxRow(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_buy_boxes")
    .select("*, editor:profiles!h4a_buy_boxes_updated_by_fkey(full_name, email)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Admin only (RLS): whether a forwarding address exists, and its last 4 characters. */
export async function getInboundAddress(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("h4a_inbound_addresses")
    .select(
      "token_hint, created_at, updated_at, creator:profiles!h4a_inbound_addresses_created_by_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data;
}

export type DealFinderToday = {
  buyBoxEmpty: boolean;
  threshold: number;
  newMatches: { count: number; top: { id: string; address: string; score: number | null }[] };
  needsReview: { count: number; top: { id: string; address: string; receivedAt: string }[] };
  verification: { count: number; top: { id: string; address: string; score: number | null }[] };
};

/** Today cards (RLS-scoped, real data only). */
export async function getDealFinderToday(
  workspaceId: string,
  now = new Date(),
): Promise<DealFinderToday> {
  const supabase = await createClient();
  const buyBox = await loadBuyBox(supabase, workspaceId);
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const [matches, review, verify] = await Promise.all([
    supabase
      .from("h4a_listings")
      .select("id, address, score", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gte("received_at", since)
      .gte("score", buyBox.alertThreshold)
      .neq("status", "dismissed")
      .order("score", { ascending: false })
      .limit(3),
    supabase
      .from("h4a_listings")
      .select("id, address, received_at", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("status", "needs_review")
      .order("received_at", { ascending: false })
      .limit(3),
    supabase
      .from("h4a_listings")
      .select("id, address, score", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .in("status", ["new", "needs_review"])
      .eq("verification_status", "unverified")
      .order("score", { ascending: false, nullsFirst: false })
      .limit(3),
  ]);
  for (const r of [matches, review, verify]) if (r.error) throw r.error;
  return {
    buyBoxEmpty: isBuyBoxEmpty(buyBox),
    threshold: buyBox.alertThreshold,
    newMatches: { count: matches.count ?? 0, top: matches.data ?? [] },
    needsReview: {
      count: review.count ?? 0,
      top: (review.data ?? []).map((r) => ({
        id: r.id,
        address: r.address,
        receivedAt: r.received_at,
      })),
    },
    verification: { count: verify.count ?? 0, top: verify.data ?? [] },
  };
}
