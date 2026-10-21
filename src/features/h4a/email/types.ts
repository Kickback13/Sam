import type { EmailLink } from "./html";

export type Confidence = "high" | "medium" | "low";

/** An email as it reached us (Resend inbound, paste box or demo seed). */
export type InboundEmail = {
  from: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  receivedAt?: string | null;
};

/** What parsers read: the original sender/subject (forwarding unwrapped) and readable text. */
export type EmailContext = {
  from: string | null;
  fromName: string | null;
  fromAddress: string | null;
  fromDomain: string | null;
  subject: string;
  text: string;
  links: EmailLink[];
  /** Who forwarded it, when it arrived as a forward. */
  forwardedBy: string | null;
};

/** Raw values a parser found (numbers as numbers, everything else as text). */
export type CandidateFields = Partial<
  Record<
    | "address"
    | "city"
    | "state"
    | "zip"
    | "apn"
    | "property_type"
    | "price"
    | "units"
    | "cap_rate"
    | "year_built"
    | "building_sqft"
    | "lot_sqft"
    | "submarket"
    | "broker_name"
    | "broker_company"
    | "broker_phone"
    | "broker_email"
    | "listing_url",
    string | number | null
  >
>;

export type ParsedCandidate = {
  fields: CandidateFields;
  /** Price per unit as written in the email, if any (only used to cross-check). */
  statedPricePerUnit?: number | null;
  notes?: string[];
};

export interface EmailParser {
  key: string;
  label: string;
  /** Name shown on source chips ("LoopNet alert"). */
  sourceLabel: string;
  /**
   * "placeholder": written against made-up fixture emails in Phase 2A; replaced
   * once Sam's real samples arrive (2B). "verified": tested on real samples.
   */
  formatStatus: "placeholder" | "verified";
  matches(ctx: EmailContext): boolean;
  parse(ctx: EmailContext): ParsedCandidate[];
}
