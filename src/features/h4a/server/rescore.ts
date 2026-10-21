import "server-only";

import { toJson } from "@/lib/db/json";
import type { ServerSupabase } from "@/lib/supabase/server";

import type { ScoreRow } from "../pipeline/types";
import { buyBoxFromRow, scoreListing, type BuyBox } from "../scoring/score";

const OPEN = ["new", "needs_review"];

/** Never scored (any status), or an open listing scored against an older buy box. */
function staleFilter(version: number) {
  return `scored_buy_box_version.is.null,and(status.in.(new,needs_review),scored_buy_box_version.neq.${version})`;
}
const PAGE = 1000;
const BATCH = 500;

export async function loadBuyBox(supabase: ServerSupabase, workspaceId: string): Promise<BuyBox> {
  const { data, error } = await supabase
    .from("h4a_buy_boxes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return buyBoxFromRow(data);
}

/**
 * Re-score open listings (New + Needs review) against the current buy box.
 * Runs synchronously under the user's session (ADR-023): set-sized pages,
 * pure scoring in TypeScript, batched saves. With onlyStale, only listings
 * scored against an older buy-box version (or never scored) are touched.
 * Never creates alerts — alerts are for new or updated listings only.
 */
export async function rescoreOpenListings(
  supabase: ServerSupabase,
  workspaceId: string,
  opts: { onlyStale?: boolean } = {},
): Promise<{ scored: number; version: number }> {
  const buyBox = await loadBuyBox(supabase, workspaceId);
  let scored = 0;
  let from = 0;
  // Bounded: 200 pages × 1,000 listings, and a buy-box change mid-run can't loop forever.
  for (let page = 0; page < 200; page++) {
    let q = supabase
      .from("h4a_listings")
      .select(
        "id, zip, city, submarket, property_type, units, price, year_built, scored_buy_box_version",
      )
      .eq("workspace_id", workspaceId)
      .order("id")
      .range(from, from + PAGE - 1);
    q = opts.onlyStale ? q.or(staleFilter(buyBox.version)) : q.in("status", OPEN);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const scores: ScoreRow[] = rows.map((l) => {
      const s = scoreListing({ ...l, price: l.price === null ? null : Number(l.price) }, buyBox);
      return {
        listing_id: l.id,
        score: s.score,
        breakdown: s.breakdown,
        buy_box_version: buyBox.version,
      };
    });
    for (let i = 0; i < scores.length; i += BATCH) {
      const { error: saveError } = await supabase.rpc("h4a_save_scores", {
        p_workspace_id: workspaceId,
        p_scores: toJson(scores.slice(i, i + BATCH)),
        p_alertable: [],
      });
      if (saveError) throw saveError;
    }
    scored += scores.length;
    // With onlyStale the saved rows drop out of the filter, so keep reading from the start.
    if (rows.length < PAGE) break;
    if (!opts.onlyStale) from += PAGE;
  }
  return { scored, version: buyBox.version };
}

/** How many listings need (re)scoring: never scored, or open and scored against an older buy box. */
export async function countStale(supabase: ServerSupabase, workspaceId: string, version: number) {
  const { count, error } = await supabase
    .from("h4a_listings")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .or(staleFilter(version));
  if (error) throw error;
  return count ?? 0;
}
