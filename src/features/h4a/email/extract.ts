/**
 * Field extraction helpers shared by every parser (pure). Regex-based on the
 * readable text of the email; everything found is checked again by
 * listingFieldsSchema before it can reach the database.
 */
import { normalizePhone } from "@/lib/normalize";

import { splitAddressLine } from "../listing/normalize";
import type { EmailLink } from "./html";

/** "$4,950,000" · "$4.95M" · "$4.95 million" · "$850K" · "4950000" → number */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million|k|thousand)?\b/i);
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === "m" || unit === "mm" || unit === "million") n *= 1_000_000;
  else if (unit === "k" || unit === "thousand") n *= 1_000;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseInteger(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function parsePercent(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
  return m ? Number(m[1]) : null;
}

/** Value after a label on its own line: "Asking Price: $1,195,000" or "Asking Price | $1,195,000". */
export function labeled(text: string, labels: string[]): string | null {
  const alt = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  // The label must be followed by a separator or a space ("Price/Unit" is not "Price").
  const re = new RegExp(`^\\s*(?:${alt.join("|")})(?:\\s*(?::|\\||-|–)\\s*|\\s+)(.+?)\\s*$`, "im");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

const SUFFIX =
  "(?:St|Street|Ave|Avenue|Av|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place|Ter|Terrace|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Trl|Trail|Sq|Square|Plz|Plaza|Row|Loop|Run|Pass|Path|Walk|Commons|Gardens|Park|Heights)";
const STREET = `\\d{1,6}(?:-\\d{1,6})?[A-Za-z]?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9'.-]+\\s+){0,4}?${SUFFIX}(?![A-Za-z])\\.?(?:\\s+(?:[NSEW]|NE|NW|SE|SW)(?![A-Za-z]))?`;
const CITY_STATE_ZIP = `([A-Za-z][A-Za-z .'-]{1,40}?),?\\s+(?:CA|Calif\\.?|California)\\.?,?\\s+(\\d{5}(?:-\\d{4})?)`;

/** "3100 Sample Ave, San Diego, CA 92104" anywhere in the text (street required, rest optional). */
const ADDRESS_RE = new RegExp(`\\b(${STREET})(?:\\s*,?\\s*${CITY_STATE_ZIP})?`, "g");

export type FoundAddress = {
  address: string;
  city: string | null;
  zip: string | null;
  index: number;
};

export function findAddresses(text: string): FoundAddress[] {
  const out: FoundAddress[] = [];
  for (const m of text.matchAll(ADDRESS_RE)) {
    out.push({
      address: m[1].replace(/\s+/g, " ").replace(/\.$/, "").trim(),
      city: m[2]?.trim() ?? null,
      zip: m[3] ?? null,
      index: m.index ?? 0,
    });
  }
  // Street on one line, "City, CA 92104" on the next: pick it up.
  for (const a of out) {
    if (a.city || a.zip) continue;
    const after = text.slice(a.index + a.address.length, a.index + a.address.length + 80);
    const next = after.match(new RegExp(`^\\s*,?\\s*\\n?\\s*${CITY_STATE_ZIP}`));
    if (next) {
      a.city = next[1].trim();
      a.zip = next[2];
    }
  }
  return out;
}

/** "3100 Sample Ave, San Diego, CA 92104" on a single line. */
export function addressFromLine(line: string): FoundAddress | null {
  const [found] = findAddresses(line);
  if (found) return found;
  const parts = splitAddressLine(line);
  return parts.address && /^\d/.test(parts.address)
    ? { address: parts.address, city: parts.city, zip: parts.zip, index: 0 }
    : null;
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function findPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m && normalizePhone(m[0]) ? m[0].trim() : null;
}

export function findEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

export function findPrice(text: string): number | null {
  const label = labeled(text, [
    "Asking Price",
    "Price",
    "List Price",
    "Listing Price",
    "Sale Price",
    "Offered at",
    "Asking",
  ]);
  if (label) {
    const n = parseMoney(label);
    if (n !== null && n >= 10_000) return n;
  }
  const inline = text.match(
    /(?:asking(?:\s+price)?|list(?:ing)?\s+price|offered\s+at|priced\s+at|price(?:d)?(?:\s+is)?)\s*(?:of|at|:)?\s*(\$\s?[\d,]+(?:\.\d+)?\s*(?:mm|m|million|k)?)/i,
  );
  if (inline) {
    const n = parseMoney(inline[1]);
    if (n !== null && n >= 10_000) return n;
  }
  for (const m of text.matchAll(/\$\s?[\d,]+(?:\.\d+)?\s*(?:mm|m|million|k)?(?![\w/])/gi)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12);
    if (/^\s*(?:\/|per\b)\s*(?:unit|door|sf|sq)/i.test(after)) continue;
    if (/^\s*(?:psf|\/sf|rent|\/mo|per month|a month|noi|gross)/i.test(after)) continue;
    const n = parseMoney(m[0]);
    if (n !== null && n >= 50_000) return n;
  }
  return null;
}

/** The price per unit the email itself states, used only to cross-check. */
export function findStatedPricePerUnit(text: string): number | null {
  const m =
    text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(?:\/|per)\s*(?:unit|door)\b/i) ??
    text.match(/price\s*(?:\/|per)\s*unit\s*(?::|\|)?\s*\$\s?([\d,]+(?:\.\d+)?)/i);
  return m ? parseMoney(m[1]) : null;
}

const WORD_UNITS: Record<string, { units: number; type: string }> = {
  duplex: { units: 2, type: "duplex" },
  triplex: { units: 3, type: "triplex" },
  fourplex: { units: 4, type: "fourplex" },
  "four-plex": { units: 4, type: "fourplex" },
  "4-plex": { units: 4, type: "fourplex" },
  "4plex": { units: 4, type: "fourplex" },
  quadplex: { units: 4, type: "fourplex" },
  quadruplex: { units: 4, type: "fourplex" },
};

export function findUnits(text: string): number | null {
  const label = labeled(text, [
    "Units",
    "Number of Units",
    "No. of Units",
    "# of Units",
    "Unit Count",
  ]);
  if (label) {
    const n = parseInteger(label);
    if (n !== null && n > 0 && n < 100000) return n;
  }
  const m = text.match(/\b(\d{1,4})[\s-]*(?:units?|apartments|apts|doors)\b/i);
  if (m) return Number(m[1]);
  for (const [word, info] of Object.entries(WORD_UNITS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return info.units;
  }
  return null;
}

export function findPropertyType(text: string, units: number | null): string | null {
  const label = labeled(text, ["Property Type", "Type", "Asset Type", "Property Subtype"]);
  const hay = `${label ?? ""}\n${text}`;
  for (const [word, info] of Object.entries(WORD_UNITS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(label ?? "")) return info.type;
  }
  if (/mixed[\s-]?use/i.test(label ?? "")) return "mixed_use";
  if (/multi[\s-]?family|apartment/i.test(label ?? "")) return "multifamily";
  for (const [word, info] of Object.entries(WORD_UNITS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(hay)) return info.type;
  }
  if (/mixed[\s-]?use/i.test(hay)) return "mixed_use";
  if (/multi[\s-]?family|apartment (?:building|complex|community)|\bapartments\b/i.test(hay))
    return "multifamily";
  if (units !== null && units >= 5) return "multifamily";
  return null;
}

export function findYearBuilt(text: string): number | null {
  const m = text.match(
    /(?:year\s+built|built(?:\s+in)?|constructed(?:\s+in)?|yr\.?\s*built)\s*(?::|\|)?\s*((?:18|19|20)\d{2})\b/i,
  );
  return m ? Number(m[1]) : null;
}

export function findCapRate(text: string): number | null {
  const m =
    text.match(/cap(?:italization)?\s*rate\s*(?::|\||of|is)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i) ??
    text.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*cap\b/i);
  return m ? Number(m[1]) : null;
}

/** Building and lot square footage. A size followed or preceded by "lot" is the lot. */
export function findSquareFeet(text: string): { building: number | null; lot: number | null } {
  let building: number | null = null;
  let lot: number | null = null;
  const lotLabel = labeled(text, ["Lot Size", "Lot", "Land Area", "Lot Area"]);
  if (lotLabel) {
    const acres = lotLabel.match(/([\d.]+)\s*(?:acres?|ac)\b/i);
    lot = acres ? Math.round(Number(acres[1]) * 43560) : parseInteger(lotLabel);
  }
  const bLabel = labeled(text, [
    "Building Size",
    "Building SF",
    "Square Footage",
    "Rentable Area",
    "Size",
    "GBA",
  ]);
  if (bLabel) {
    const parts = bLabel.split("|")[0];
    building = parseInteger(parts);
  }
  for (const m of text.matchAll(
    /([\d,]{3,})\s*(?:\+\/-\s*)?(?:sq\.?\s*ft\.?|sf\b|square\s+feet)/gi,
  )) {
    const n = parseInteger(m[1]);
    if (n === null) continue;
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 14), start).toLowerCase();
    const after = text.slice(start + m[0].length, start + m[0].length + 8).toLowerCase();
    if (/^\s*(?:of\s+)?lot\b/.test(after) || /lot(?:\s+size)?\s*:?\s*$/.test(before)) {
      lot ??= n;
    } else {
      building ??= n;
    }
  }
  return { building, lot };
}

export function findApn(text: string): string | null {
  const m = text.match(
    /\b(?:APN|A\.P\.N\.|Parcel(?:\s+(?:No\.?|Number|#))?)\s*[:#|]?\s*(\d{3}-?\d{3}-?\d{2}-?\d{2}|\d{6,14})\b/i,
  );
  return m ? m[1] : null;
}

const SKIP_LINK =
  /unsubscribe|manage|preferences|privacy|terms|settings|login|sign[\s-]?in|facebook|twitter|linkedin|instagram|youtube|app\s*store|google\s*play|help|support|mailto:/i;

/** The link to the original listing: a "View listing"-style link, else one whose URL looks like a listing. */
export function findListingLink(links: EmailLink[]): string | null {
  const usable = links.filter((l) => !SKIP_LINK.test(`${l.href} ${l.text}`));
  const byText = usable.find((l) =>
    /view|listing|property|details|flyer|offering|brochure|\bom\b/i.test(l.text),
  );
  if (byText) return byText.href;
  const byUrl = usable.find((l) => /listing|propert|\/l\/|\/p\//i.test(l.href));
  return byUrl?.href ?? null;
}
