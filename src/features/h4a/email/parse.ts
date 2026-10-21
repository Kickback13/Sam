/**
 * Parser registry and pipeline entry point (pure).
 *
 *   email → readable text (HTML converted) → unwrap forward → pick the parser
 *   for the ORIGINAL sender → if it finds nothing, the generic fallback →
 *   validate every field (listingFieldsSchema) → confidence + review reasons.
 *
 * Low or medium confidence ⇒ the listing is created as "Needs review" and the
 * email is shown beside the parsed fields. Links in the email are recorded,
 * never fetched. See docs/DECISIONS.md (ADR-020).
 */
import { listingFieldsSchema, type ListingFields } from "../listing/schema";
import { domainOf, parseMailbox, stripSubjectPrefixes, unwrapForward } from "./forward";
import { extractLinks, extractTextLinks, htmlToText, tidyText } from "./html";
import { crexiPlaceholderParser } from "./parsers/crexi-placeholder";
import { genericSourceLabel, parseGeneric } from "./parsers/generic";
import { loopnetPlaceholderParser } from "./parsers/loopnet-placeholder";
import type {
  CandidateFields,
  Confidence,
  EmailContext,
  EmailParser,
  InboundEmail,
  ParsedCandidate,
} from "./types";

/** One parser per sender format. Order matters only if two could match. */
export const PARSERS: EmailParser[] = [loopnetPlaceholderParser, crexiPlaceholderParser];

export const GENERIC_PARSER = {
  key: "generic",
  label: "Generic reader (fallback)",
} as const;

export type ParsedListing = {
  fields: ListingFields;
  confidence: Confidence;
  needsReview: boolean;
  reviewReasons: string[];
  notes: string[];
};

export type ParseResult = {
  kind: "listings" | "forwarding_confirmation" | "none";
  parserKey: string;
  parserLabel: string;
  sourceLabel: string;
  formatStatus: "placeholder" | "verified" | "generic" | "none";
  confidence: Confidence | null;
  listings: ParsedListing[];
  notes: string[];
  /** Gmail sends a code to confirm a new forwarding address. */
  confirmationCode?: string | null;
  context: EmailContext;
};

export function buildContext(email: InboundEmail): EmailContext {
  const text =
    email.text && email.text.trim().length > 0
      ? tidyText(email.text)
      : email.html
        ? htmlToText(email.html)
        : "";
  const unwrapped = unwrapForward(text);
  const original = parseMailbox(unwrapped.from ?? email.from);
  const links = email.html ? extractLinks(email.html) : [];
  return {
    from: unwrapped.from ?? email.from,
    fromName: original.name,
    fromAddress: original.address,
    fromDomain: domainOf(original.address),
    subject: stripSubjectPrefixes(unwrapped.subject ?? email.subject),
    text: unwrapped.body,
    links: [...links, ...extractTextLinks(unwrapped.body)],
    forwardedBy: unwrapped.forwarded ? email.from : null,
  };
}

function gmailConfirmation(email: InboundEmail, ctx: EmailContext): string | null {
  const subject = email.subject ?? "";
  if (
    !/forwarding confirmation/i.test(subject) &&
    !/forwarding-noreply@google\.com/i.test(email.from ?? "")
  )
    return null;
  return (
    subject.match(/\(#(\d{6,12})\)/)?.[1] ??
    ctx.text.match(/confirmation code:\s*(\d{6,12})/i)?.[1] ??
    ""
  );
}

/** Validate field by field: an unreadable value is dropped (and noted), not fatal. */
function cleanFields(raw: CandidateFields): { fields: ListingFields | null; notes: string[] } {
  const notes: string[] = [];
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw))
    if (v !== null && v !== undefined && v !== "") input[k] = v;
  for (let attempt = 0; attempt < 20; attempt++) {
    const parsed = listingFieldsSchema.safeParse(input);
    if (parsed.success) return { fields: parsed.data, notes };
    const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    if (bad.has("address")) return { fields: null, notes: [...notes, "No usable street address"] };
    for (const key of bad) {
      notes.push(`Ignored ${key.replace(/_/g, " ")} "${String(input[key]).slice(0, 60)}"`);
      delete input[key];
    }
  }
  return { fields: null, notes };
}

function assess(
  fields: ListingFields,
  candidate: ParsedCandidate,
  generic: boolean,
): { confidence: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  const hasLocation = Boolean(fields.city || fields.zip);
  if (!hasLocation) reasons.push("No city or ZIP found");
  if (fields.price === null) reasons.push("No price found");
  if (fields.units === null) reasons.push("No unit count found");
  if (fields.price !== null && fields.units && candidate.statedPricePerUnit) {
    const computed = fields.price / fields.units;
    if (Math.abs(computed - candidate.statedPricePerUnit) / candidate.statedPricePerUnit > 0.01)
      reasons.push(
        `The email's price per unit ($${Math.round(candidate.statedPricePerUnit).toLocaleString("en-US")}) doesn't match price ÷ units`,
      );
  }
  let confidence: Confidence =
    hasLocation && fields.price !== null && fields.units !== null
      ? "high"
      : fields.price !== null || fields.units !== null
        ? "medium"
        : "low";
  if (generic) {
    reasons.push("Read by the generic fallback reader — check every field");
    if (confidence === "high") confidence = "medium";
  }
  if (reasons.some((r) => r.startsWith("The email's price per unit")) && confidence === "high")
    confidence = "medium";
  return { confidence, reasons };
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function parseEmail(email: InboundEmail): ParseResult {
  const ctx = buildContext(email);
  const notes: string[] = [];

  const code = gmailConfirmation(email, ctx);
  if (code !== null) {
    return {
      kind: "forwarding_confirmation",
      parserKey: "gmail-forwarding-confirmation",
      parserLabel: "Gmail forwarding confirmation",
      sourceLabel: "Gmail",
      formatStatus: "none",
      confidence: null,
      listings: [],
      notes: [
        code
          ? `Gmail forwarding confirmation code ${code}. Enter it in Gmail → Settings → Forwarding to finish setup.`
          : "Gmail forwarding confirmation. Open the email to finish setup.",
      ],
      confirmationCode: code || null,
      context: ctx,
    };
  }

  let parser: {
    key: string;
    label: string;
    sourceLabel: string;
    status: ParseResult["formatStatus"];
  } | null = null;
  let candidates: ParsedCandidate[] = [];
  for (const p of PARSERS) {
    if (!p.matches(ctx)) continue;
    candidates = p.parse(ctx);
    if (candidates.length > 0) {
      parser = { key: p.key, label: p.label, sourceLabel: p.sourceLabel, status: p.formatStatus };
      if (p.formatStatus === "placeholder")
        notes.push(`${p.label}: built from a made-up sample; real samples replace it in Phase 2B.`);
      break;
    }
    notes.push(`${p.label} matched the sender but found no listings; used the generic reader.`);
  }
  const generic = parser === null;
  if (generic) {
    candidates = parseGeneric(ctx);
    parser = {
      key: GENERIC_PARSER.key,
      label: GENERIC_PARSER.label,
      sourceLabel: genericSourceLabel(ctx),
      status: "generic",
    };
  }

  const listings: ParsedListing[] = [];
  for (const c of candidates) {
    const { fields, notes: fieldNotes } = cleanFields(c.fields);
    if (!fields) {
      notes.push(...fieldNotes);
      continue;
    }
    const { confidence, reasons } = assess(fields, c, generic);
    listings.push({
      fields,
      confidence,
      needsReview: confidence !== "high",
      reviewReasons: [...reasons, ...fieldNotes],
      notes: [...(c.notes ?? []), ...fieldNotes],
    });
  }

  if (listings.length === 0) notes.push("No listing found in this email.");
  const overall = listings.length
    ? listings.reduce<Confidence>(
        (min, l) => (RANK[l.confidence] < RANK[min] ? l.confidence : min),
        "high",
      )
    : null;

  return {
    kind: listings.length ? "listings" : "none",
    parserKey: parser!.key,
    parserLabel: parser!.label,
    sourceLabel: parser!.sourceLabel,
    formatStatus: listings.length ? parser!.status : "none",
    confidence: overall,
    listings,
    notes,
    context: ctx,
  };
}
