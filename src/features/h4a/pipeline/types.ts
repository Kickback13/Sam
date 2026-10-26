import type { Confidence } from "../email/types";
import type { ListingFields } from "../listing/schema";
import type { CriterionResult } from "../scoring/score";

export type IngestOrigin = "email" | "csv" | "manual" | "paste" | "county";

/** What app_private.h4a_ingest_one receives (see the functions migration). */
export type IngestItem = {
  origin: IngestOrigin;
  source: { label: string; url?: string | null; fetched_at?: string | null };
  fields: Partial<ListingFields>;
  keys: { street_key: string | null; apn_key: string | null; match_keys: string[] };
  review: { needs_review: boolean; reasons: string[]; confidence: Confidence | null };
  listing_id?: string | null;
};

export type ScoringSnapshot = {
  id: string;
  status: string;
  zip: string | null;
  city: string | null;
  submarket: string | null;
  property_type: string | null;
  units: number | null;
  price: number | string | null;
  price_per_unit: number | string | null;
  year_built: number | null;
};

export type IngestResultRow =
  | {
      index: number;
      listing_id: string;
      action: "created" | "updated" | "unchanged";
      changed: boolean;
      snapshot: ScoringSnapshot;
      kept?: Record<string, unknown>;
    }
  | { index: number; action: "error"; code: string; error: string };

export type IngestResponse = {
  results: IngestResultRow[];
  buy_box: Record<string, unknown>;
};

export type ScoreRow = {
  listing_id: string;
  score: number | null;
  breakdown: CriterionResult[];
  buy_box_version: number;
};

export type CreatedAlert = {
  alert_id: string;
  listing_id: string;
  score: number;
  threshold: number;
  address: string;
  city: string | null;
  zip: string | null;
  price: number | string | null;
  units: number | null;
  source_label: string;
  notify_email: string | null;
};

export type SaveScoresResponse = {
  saved: number;
  stale: number;
  version: number;
  alerts: CreatedAlert[];
};

export type AlertEmailStatus = "not_connected" | "off" | "queued" | "sent" | "failed";

export type EmailPatch = Partial<{
  text_body: string | null;
  html_body: string | null;
  body_status: "pending" | "stored" | "failed";
  parse_status: "pending" | "parsed" | "no_listings" | "failed";
  parser_key: string | null;
  parser_label: string | null;
  confidence: Confidence | null;
  listing_count: number;
  parse_notes: string[];
  error: string | null;
  attempt: boolean;
}>;

/**
 * Storage the pipeline needs. Two implementations: the signed-in user's
 * session (RLS + membership checks) and the inbound address token (no session).
 */
export interface DealStore {
  ingest(items: IngestItem[]): Promise<IngestResponse>;
  saveScores(
    scores: ScoreRow[],
    alertable: string[],
    emailStatus: "not_connected" | "off" | "queued",
  ): Promise<SaveScoresResponse>;
  updateEmail(patch: EmailPatch): Promise<void>;
  setAlertEmailStatus(
    alertId: string,
    status: AlertEmailStatus,
    error?: string | null,
  ): Promise<void>;
}
