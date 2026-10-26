import { describe, expect, it } from "vitest";

import { listingKeys } from "@/features/h4a/listing/normalize";
import { buyBoxFromRow, scoreListing } from "@/features/h4a/scoring/score";

import { db } from "./env";

/** The Deal Finder demo seed: Demo workspaces only, keys from the real normalizer, alert scores from the real scorer. */
describe("H4A demo seed", () => {
  it("writes Deal Finder rows only into demo workspaces", async () => {
    const c = await db();
    try {
      for (const t of [
        "h4a_buy_boxes",
        "h4a_listings",
        "h4a_listing_events",
        "h4a_inbound_emails",
        "h4a_alerts",
      ]) {
        const { rows } = await c.query(
          `select count(*)::int as n from public.${t} x join public.workspaces w on w.id = x.workspace_id where not w.is_demo`,
        );
        expect(rows[0].n, `${t} rows outside demo workspaces`).toBe(0);
      }
    } finally {
      await c.end();
    }
  });

  it("uses the same dedupe keys the app computes, and seeded alert scores match the scoring module", async () => {
    const c = await db();
    try {
      const { rows: listings } = await c.query(
        `select l.* from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id
         where w.slug = 'demo' and l.origin = 'demo'`,
      );
      expect(listings.length).toBeGreaterThanOrEqual(9);
      for (const l of listings) {
        const k = listingKeys(l);
        expect(l.street_key, l.address).toBe(k.streetKey);
        expect([...l.match_keys].sort(), l.address).toEqual([...k.matchKeys].sort());
      }
      const { rows: boxes } = await c.query(
        `select b.* from public.h4a_buy_boxes b join public.workspaces w on w.id = b.workspace_id where w.slug = 'demo'`,
      );
      const buyBox = buyBoxFromRow(boxes[0]);
      const { rows: alerts } = await c.query(
        `select l.*, a.score as alert_score from public.h4a_alerts a join public.h4a_listings l on l.id = a.listing_id
         join public.workspaces w on w.id = a.workspace_id where w.slug = 'demo'`,
      );
      expect(alerts.length).toBe(4);
      for (const a of alerts) {
        const s = scoreListing({ ...a, price: a.price === null ? null : Number(a.price) }, buyBox);
        expect(s.score, a.address).toBe(a.alert_score);
        expect(s.score!).toBeGreaterThanOrEqual(buyBox.alertThreshold);
      }
    } finally {
      await c.end();
    }
  });
});
