import "server-only";

import { createClient } from "@/lib/supabase/server";

import { countStale, loadBuyBox, rescoreOpenListings } from "./rescore";

/**
 * Self-healing scores: if any open listing was scored against an older buy box
 * (or never — e.g. demo seed rows, or a rescore that failed), re-score just
 * those before rendering. Writers only; viewers see "Not scored yet".
 * Idempotent, so a repeated or prefetched render is harmless.
 */
export async function ensureFreshScores(workspaceId: string, canWrite: boolean) {
  if (!canWrite) return;
  try {
    const supabase = await createClient();
    const { version } = await loadBuyBox(supabase, workspaceId);
    if ((await countStale(supabase, workspaceId, version)) === 0) return;
    await rescoreOpenListings(supabase, workspaceId, { onlyStale: true });
  } catch (e) {
    console.error("h4a: could not refresh stale scores", e);
  }
}
