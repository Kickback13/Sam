import { describe, expect, it } from "vitest";

import type { AlertEmailConfig } from "../alerts/email";
import { CREXI_SINGLE, LOOPNET_DIGEST, NEWSLETTER } from "../email/fixtures/placeholder-emails";
import { isSameListing } from "../listing/dedupe";
import { ingestAndScore, itemFromFields, processEmail } from "./pipeline";
import type {
  AlertEmailStatus,
  DealStore,
  EmailPatch,
  IngestItem,
  IngestResponse,
  SaveScoresResponse,
  ScoreRow,
} from "./types";

const OFF: AlertEmailConfig = { enabled: false, apiKey: null, from: null, reason: "off" };

/** In-memory stand-in for the database functions (same dedupe rule, same threshold logic). */
class FakeStore implements DealStore {
  listings: {
    id: string;
    item: IngestItem;
    fields: Record<string, unknown>;
    score?: number | null;
  }[] = [];
  alerts: { listing_id: string; score: number; status: AlertEmailStatus }[] = [];
  emailPatches: EmailPatch[] = [];
  buyBox: Record<string, unknown> = {
    version: 2,
    alert_threshold: 70,
    zips: ["92104", "92105"],
    max_price_per_unit: 300000,
  };

  async ingest(items: IngestItem[]): Promise<IngestResponse> {
    return {
      buy_box: this.buyBox,
      results: items.map((item, index) => {
        const keyed = { apnKey: item.keys.apn_key, matchKeys: item.keys.match_keys };
        const existing = this.listings.find((l) =>
          isSameListing(keyed, { apnKey: l.item.keys.apn_key, matchKeys: l.item.keys.match_keys }),
        );
        let changed = true;
        let action: "created" | "updated" | "unchanged" = "created";
        let row = existing;
        if (existing) {
          const before = JSON.stringify(existing.fields);
          existing.fields = { ...existing.fields, ...item.fields };
          changed = before !== JSON.stringify(existing.fields);
          action = changed ? "updated" : "unchanged";
        } else {
          row = { id: `L${this.listings.length + 1}`, item, fields: { ...item.fields } };
          this.listings.push(row);
        }
        const f = row!.fields as Record<string, never>;
        return {
          index,
          listing_id: row!.id,
          action,
          changed,
          snapshot: {
            id: row!.id,
            status: "new",
            zip: f.zip ?? null,
            city: f.city ?? null,
            submarket: null,
            property_type: f.property_type ?? null,
            units: f.units ?? null,
            price: f.price ?? null,
            price_per_unit: null,
            year_built: f.year_built ?? null,
          },
        };
      }),
    };
  }
  async saveScores(scores: ScoreRow[], alertable: string[]): Promise<SaveScoresResponse> {
    const alerts = [];
    for (const s of scores) {
      const l = this.listings.find((x) => x.id === s.listing_id)!;
      l.score = s.score;
      if (
        s.score !== null &&
        s.score >= 70 &&
        alertable.includes(l.id) &&
        !this.alerts.some((a) => a.listing_id === l.id)
      ) {
        this.alerts.push({ listing_id: l.id, score: s.score, status: "not_connected" });
        alerts.push({
          alert_id: `A${this.alerts.length}`,
          listing_id: l.id,
          score: s.score,
          threshold: 70,
          address: String(l.fields.address),
          city: null,
          zip: null,
          price: null,
          units: null,
          source_label: l.item.source.label,
          notify_email: null,
        });
      }
    }
    return { saved: scores.length, stale: 0, version: 2, alerts };
  }
  async updateEmail(patch: EmailPatch) {
    this.emailPatches.push(patch);
  }
  async setAlertEmailStatus() {}
}

describe("ingestAndScore", () => {
  it("dedupes, scores with the current buy box and alerts once per listing", async () => {
    const store = new FakeStore();
    const item = itemFromFields(
      { address: "1150 Fictional Ct", city: "San Diego", zip: "92105", price: 1_195_000, units: 4 },
      "manual",
      { label: "Entered by Erin" },
    );
    const first = await ingestAndScore(store, [item], OFF);
    expect(first.results[0]).toMatchObject({ action: "created" });
    expect(store.listings[0].score).toBe(100);
    expect(first.alerts).toHaveLength(1);

    // Same building again (different spelling): updates, never duplicates, no second alert.
    const again = itemFromFields(
      { address: "1150 Fictional Court", zip: "92105", price: 1_150_000 },
      "csv",
      { label: "CSV: export.csv" },
    );
    const second = await ingestAndScore(store, [again], OFF);
    expect(store.listings).toHaveLength(1);
    expect(second.results[0]).toMatchObject({ action: "updated" });
    expect(second.alerts).toHaveLength(0);
  });

  it("does not alert below the threshold", async () => {
    const store = new FakeStore();
    // ZIP outside the buy box (25 of 45 weight misses) → 44.
    const r = await ingestAndScore(
      store,
      [
        itemFromFields({ address: "9 Far Rd", zip: "91910", price: 900_000, units: 4 }, "manual", {
          label: "x",
        }),
      ],
      OFF,
    );
    expect(store.listings[0].score).toBe(44);
    expect(r.alerts).toEqual([]);
  });

  it("does nothing for an empty batch", async () => {
    expect(await ingestAndScore(new FakeStore(), [], OFF)).toEqual({
      results: [],
      alerts: [],
      stale: 0,
    });
  });
});

describe("processEmail", () => {
  it("parses, ingests and records the outcome on the email", async () => {
    const store = new FakeStore();
    const out = await processEmail(
      store,
      { ...LOOPNET_DIGEST, receivedAt: "2026-10-20T10:00:00Z" },
      "email",
      OFF,
    );
    expect(out.parse.parserKey).toBe("loopnet-saved-search");
    expect(store.listings.map((l) => l.fields.address)).toEqual([
      "3100 Sample Ave",
      "4415 Example St",
    ]);
    expect(store.listings[0].item.source).toEqual({
      label: "LoopNet alert",
      url: "https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/",
      fetched_at: "2026-10-20T10:00:00Z",
    });
    expect(store.emailPatches.at(-1)).toMatchObject({
      parse_status: "parsed",
      listing_count: 2,
      parser_key: "loopnet-saved-search",
    });
  });

  it("labels pasted emails as pasted and keeps review flags", async () => {
    const store = new FakeStore();
    await processEmail(store, CREXI_SINGLE, "paste", OFF);
    expect(store.listings[0].item).toMatchObject({
      origin: "paste",
      source: { label: "Crexi alert (pasted)" },
      review: { needs_review: false, confidence: "high" },
    });
  });

  it("records 'no listings' for an email without any", async () => {
    const store = new FakeStore();
    await processEmail(store, NEWSLETTER, "email", OFF);
    expect(store.listings).toEqual([]);
    expect(store.emailPatches.at(-1)).toMatchObject({
      parse_status: "no_listings",
      listing_count: 0,
    });
  });

  it("records the failure on the email and rethrows (so the job retries)", async () => {
    const store = new FakeStore();
    store.ingest = async () => {
      throw new Error("database unavailable");
    };
    await expect(processEmail(store, LOOPNET_DIGEST, "email", OFF)).rejects.toThrow(
      "database unavailable",
    );
    expect(store.emailPatches.at(-1)).toMatchObject({
      parse_status: "failed",
      error: "database unavailable",
    });
  });
});
