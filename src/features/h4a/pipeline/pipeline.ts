/**
 * The Deal Finder ingestion pipeline (no I/O of its own — everything goes
 * through a DealStore). Used by manual entry, CSV upload, "Paste an email" and
 * the forwarded-email webhook/Inngest function:
 *
 *   items → ingest (dedupe + merge + history, in the database)
 *         → score each merged listing (scoring/score.ts)
 *         → save scores (alerts for new/updated listings at or above threshold)
 *         → owner alert email (behind a flag; off and "Not connected" in 2A)
 */
import type { AlertEmailConfig } from "../alerts/email";
import { composeAlertEmail, sendAlertEmail } from "../alerts/email";
import type { ParsedListing, ParseResult } from "../email/parse";
import { parseEmail } from "../email/parse";
import type { InboundEmail } from "../email/types";
import { listingKeys } from "../listing/normalize";
import type { ListingFields } from "../listing/schema";
import { buyBoxFromRow, scoreListing } from "../scoring/score";
import type {
  CreatedAlert,
  DealStore,
  IngestItem,
  IngestOrigin,
  IngestResultRow,
  ScoreRow,
} from "./types";

export function keysFor(fields: Partial<ListingFields>): IngestItem["keys"] {
  const k = listingKeys({
    address: fields.address,
    city: fields.city,
    zip: fields.zip,
    apn: fields.apn,
  });
  return { street_key: k.streetKey, apn_key: k.apnKey, match_keys: k.matchKeys };
}

/** Drop empty values so the database only sees (and sources) fields that were provided. */
export function compactFields(fields: Partial<ListingFields>): Partial<ListingFields> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields))
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out as Partial<ListingFields>;
}

export function itemFromFields(
  fields: Partial<ListingFields>,
  origin: IngestOrigin,
  source: IngestItem["source"],
  opts: { listingId?: string | null; review?: IngestItem["review"] } = {},
): IngestItem {
  return {
    origin,
    source,
    fields: compactFields(fields),
    keys: keysFor(fields),
    review: opts.review ?? { needs_review: false, reasons: [], confidence: null },
    listing_id: opts.listingId ?? null,
  };
}

export function itemFromParsed(
  parsed: ParsedListing,
  origin: "email" | "paste",
  sourceLabel: string,
  fetchedAt: string | null,
): IngestItem {
  return itemFromFields(
    parsed.fields,
    origin,
    { label: sourceLabel, url: parsed.fields.listing_url ?? null, fetched_at: fetchedAt },
    {
      review: {
        needs_review: parsed.needsReview,
        reasons: parsed.reviewReasons,
        confidence: parsed.confidence,
      },
    },
  );
}

export type PipelineResult = {
  results: IngestResultRow[];
  alerts: CreatedAlert[];
  stale: number;
};

export async function ingestAndScore(
  store: DealStore,
  items: IngestItem[],
  alertEmail: AlertEmailConfig,
  workspaceUrl: string | null = null,
): Promise<PipelineResult> {
  if (items.length === 0) return { results: [], alerts: [], stale: 0 };
  const res = await store.ingest(items);
  const buyBox = buyBoxFromRow(res.buy_box);

  const scores: ScoreRow[] = [];
  const alertable: string[] = [];
  for (const r of res.results) {
    if (r.action === "error") continue;
    const s = scoreListing(
      {
        zip: r.snapshot.zip,
        city: r.snapshot.city,
        submarket: r.snapshot.submarket,
        property_type: r.snapshot.property_type,
        units: r.snapshot.units,
        price: r.snapshot.price === null ? null : Number(r.snapshot.price),
        year_built: r.snapshot.year_built,
      },
      buyBox,
    );
    scores.push({
      listing_id: r.listing_id,
      score: s.score,
      breakdown: s.breakdown,
      buy_box_version: buyBox.version,
    });
    if (r.changed) alertable.push(r.listing_id);
  }

  const saved = scores.length
    ? await store.saveScores(scores, alertable, alertEmail.enabled ? "queued" : "not_connected")
    : { saved: 0, stale: 0, version: buyBox.version, alerts: [] };

  if (alertEmail.enabled) {
    for (const alert of saved.alerts) {
      if (!alert.notify_email) {
        await store.setAlertEmailStatus(
          alert.alert_id,
          "not_connected",
          "No owner email is set for this workspace.",
        );
        continue;
      }
      try {
        await sendAlertEmail(
          alertEmail,
          alert.notify_email,
          composeAlertEmail(alert, workspaceUrl),
        );
        await store.setAlertEmailStatus(alert.alert_id, "sent");
      } catch (e) {
        await store.setAlertEmailStatus(
          alert.alert_id,
          "failed",
          e instanceof Error ? e.message : "Send failed",
        );
      }
    }
  }
  return { results: res.results, alerts: saved.alerts, stale: saved.stale };
}

export type EmailOutcome = {
  parse: Omit<ParseResult, "context">;
  pipeline: PipelineResult;
};

/** Parse an already-stored email and ingest what it contains. */
export async function processEmail(
  store: DealStore,
  email: InboundEmail,
  origin: "email" | "paste",
  alertEmail: AlertEmailConfig,
  workspaceUrl: string | null = null,
): Promise<EmailOutcome> {
  const parsed = parseEmail(email);
  const { context: _context, ...parse } = parsed;
  void _context;
  const label = origin === "paste" ? `${parsed.sourceLabel} (pasted)` : parsed.sourceLabel;
  const items = parsed.listings.map((l) =>
    itemFromParsed(l, origin, label, email.receivedAt ?? null),
  );

  try {
    const pipeline = await ingestAndScore(store, items, alertEmail, workspaceUrl);
    const created = pipeline.results.filter((r) => r.action !== "error").length;
    const errors = pipeline.results.filter(
      (r): r is Extract<IngestResultRow, { action: "error" }> => r.action === "error",
    );
    await store.updateEmail({
      parse_status: parsed.kind === "listings" && created > 0 ? "parsed" : "no_listings",
      parser_key: parsed.parserKey,
      parser_label: parsed.parserLabel,
      confidence: parsed.confidence,
      listing_count: created,
      parse_notes: [
        ...parsed.notes,
        ...errors.map((e) => `Listing ${e.index + 1} not saved: ${e.error}`),
      ].slice(0, 50),
      error: null,
    });
    return { parse, pipeline };
  } catch (e) {
    await store.updateEmail({
      parse_status: "failed",
      parser_key: parsed.parserKey,
      parser_label: parsed.parserLabel,
      error: e instanceof Error ? e.message.slice(0, 2000) : "Processing failed",
    });
    throw e;
  }
}
