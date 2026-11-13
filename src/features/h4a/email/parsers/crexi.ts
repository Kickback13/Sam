/**
 * Crexi listing email (VERIFIED FORMAT). Written against four real Crexi
 * "You've shared …" emails from Sam's account (Nov 2026); see
 * fixtures/crexi-emails.ts for sanitized copies of their layout. Reads only the
 * email itself; links are never fetched.
 *
 * Layout (after HTML → text):
 *   header lines — a title and/or a street line, sometimes "Just Listed | 37 Units | Escondido"
 *   "Property Details", then label / value on alternating lines
 *     (Asking Price, Property Type, Sub Type, Square Footage, Cap Rate, Units,
 *      Year Built, Lot Size (acres), APN, Price/Unit, …)
 *   "Listing Contacts", then broker names, each followed by "Contact Broker"
 *   Crexi's own footer (support@crexi.com, its Los Angeles office, unsubscribe)
 *
 * Crexi sometimes leaves the street address out of the email entirely. Then we
 * create no listing (and never invent one from other numbers); a note asks a
 * person to add it by hand.
 */
import {
  addressFromLine,
  type FoundAddress,
  parseInteger,
  parseMoney,
  parsePercent,
  findPropertyType,
} from "../extract";
import type { EmailContext, EmailParser } from "../types";

const SAN_DIEGO_COUNTY_CITIES = [
  "San Diego",
  "Chula Vista",
  "Oceanside",
  "Escondido",
  "Carlsbad",
  "El Cajon",
  "Vista",
  "San Marcos",
  "Encinitas",
  "National City",
  "La Mesa",
  "Santee",
  "Poway",
  "Imperial Beach",
  "Lemon Grove",
  "Coronado",
  "Solana Beach",
  "Del Mar",
  "Fallbrook",
  "Spring Valley",
  "Lakeside",
  "Ramona",
  "Bonita",
  "Alpine",
  "Valley Center",
];

const DETAILS_START = /^property details$/i;
const CONTACTS_START = /^listing contacts$/i;
const FOOTER = /support@crexi\.com|commercial real estate exchange|unsubscribe|^\+?\s*888/i;
/** Button captions Crexi puts in the header ("Property Flyer", "Offering Memorandum"). */
const HEADER_NOISE =
  /^(property flyer|offering memorandum|view (property|listing|details)|flyer|om)$/i;
const STREET_LINE = /^\d{1,6}(?:-\d{1,6})?[A-Za-z]?\s+[A-Za-z][A-Za-z0-9 .'#-]*$/;

/** Every label Crexi's Property Details block has used (longest first, for "Label Value" lines). */
const DETAIL_LABELS = [
  "Asking Price",
  "Property Type",
  "Sub Type",
  "Investment Type",
  "Tenancy",
  "Square Footage",
  "Net Rentable (SqFt)",
  "Price per SqFt",
  "Pro-Forma Cap Rate",
  "Cap Rate",
  "Occupancy",
  "Pro-Forma NOI",
  "NOI",
  "Units",
  "Year Built",
  "Year Renovated",
  "Buildings",
  "Stories",
  "Zoning",
  "Lot Size (acres)",
  "Lot Size (SqFt)",
  "Lot Size",
  "Parking (spaces)",
  "APN",
  "Price/Unit",
  "Ownership",
].sort((a, b) => b.length - a.length);

/** "Asking Price $13,250,000" (Gmail's plain-text copy) → ["asking price", "$13,250,000"]. */
function labelAndValue(line: string): [string, string] | null {
  for (const label of DETAIL_LABELS) {
    if (line.length > label.length + 1 && line.toLowerCase().startsWith(`${label.toLowerCase()} `))
      return [label.toLowerCase(), line.slice(label.length).trim()];
  }
  return null;
}

/** Drops Gmail's "<https://…>" link markers and "[image: …]" placeholders from a line. */
function cleanLine(line: string): string {
  return line
    .replace(/<(?:https?:|mailto:|tel:)[^>]*>/gi, "")
    .replace(/<\(?\d{3}\)?[^>]*>/g, "")
    .replace(/\[image:[^\]]*\]?/gi, "")
    .trim();
}

type Sections = {
  header: string[];
  details: Map<string, string>;
  contacts: string[];
};

function sections(ctx: EmailContext): Sections | null {
  const lines = ctx.text.split("\n").map(cleanLine).filter(Boolean);
  const start = lines.findIndex((l) => DETAILS_START.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && CONTACTS_START.test(l));
  if (end < 0) end = lines.length;

  // "Label | Value" or "Label Value" on one line, or the label on one line and its value on the next.
  const details = new Map<string, string>();
  const block = lines.slice(start + 1, end);
  for (let i = 0; i < block.length; i++) {
    const cells = block[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const inline = cells.length === 1 ? labelAndValue(cells[0]) : null;
    if (cells.length >= 2) {
      for (let c = 0; c + 1 < cells.length; c += 2)
        details.set(cells[c].toLowerCase(), cells[c + 1]);
    } else if (inline) {
      details.set(inline[0], inline[1]);
    } else if (i + 1 < block.length && !block[i + 1].includes("|")) {
      details.set(cells[0].toLowerCase(), block[i + 1]);
      i++;
    }
  }

  const contacts: string[] = [];
  for (const line of lines.slice(end + 1)) {
    if (FOOTER.test(line)) break;
    for (const cell of line.split("|").map((c) => c.trim())) {
      if (cell && !/^contact broker$/i.test(cell)) contacts.push(cell);
    }
  }

  return {
    header: lines.slice(0, start).filter((l) => !HEADER_NOISE.test(l)),
    details,
    contacts,
  };
}

function sharedSubject(subject: string): string {
  return subject.replace(/^you['’]ve shared\s+/i, "").trim();
}

/** A street address from the subject or a header line; never from the numeric detail fields. */
function findStreet(header: string[], subject: string): FoundAddress | null {
  for (const line of [sharedSubject(subject), ...header]) {
    if (!/^\d/.test(line)) continue;
    // "345 East Park Avenue" alone on a line: the whole line is the street.
    if (STREET_LINE.test(line) && addressFromLine(line)) {
      return { address: line.replace(/\s+/g, " "), city: null, zip: null, index: 0 };
    }
    const found = addressFromLine(line);
    if (found && /[A-Za-z]{2,}/.test(found.address)) return found;
  }
  return null;
}

/** "Just Listed | 37 Units | Escondido": a segment that is exactly a San Diego County city. */
function findCity(header: string[], subject: string): string | null {
  for (const line of [subject, ...header]) {
    for (const seg of line.split(/\s*[|•·]\s*/)) {
      const city = SAN_DIEGO_COUNTY_CITIES.find(
        (c) => c.toLowerCase() === seg.trim().toLowerCase(),
      );
      if (city) return city;
    }
  }
  return null;
}

function lotSqft(details: Map<string, string>): number | null {
  const acres = details.get("lot size (acres)");
  if (acres) {
    const n = Number(acres.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 43_560);
  }
  return parseInteger(details.get("lot size (sqft)") ?? details.get("lot size") ?? null);
}

function title(s: Sections, subject: string): string {
  return s.header[0] ?? sharedSubject(subject) ?? "this property";
}

export const crexiParser: EmailParser = {
  key: "crexi-new-listing",
  label: "Crexi listing email",
  sourceLabel: "Crexi alert",
  formatStatus: "verified",

  matches(ctx) {
    return (
      /(^|\.)crexi\.(com|example)$/.test(ctx.fromDomain ?? "") ||
      /\bcrexi\b/i.test(ctx.fromName ?? "")
    );
  },

  parse(ctx) {
    const s = sections(ctx);
    if (!s) return [];
    const street = findStreet(s.header, ctx.subject);
    if (!street) return [];
    const d = s.details;
    const units = parseInteger(d.get("units") ?? null);
    const typeText = [d.get("property type"), d.get("sub type")]
      .filter(Boolean)
      .map((v) => `Property Type: ${v}`)
      .join("\n");
    const [broker, ...otherBrokers] = s.contacts;
    const notes = [
      "The Crexi link in the email is a tracking link, so it isn't saved. Open the original email to reach the listing.",
    ];
    if (otherBrokers.length) notes.push(`Other listing contacts: ${otherBrokers.join(", ")}`);

    return [
      {
        fields: {
          address: street.address,
          city: street.city ?? findCity(s.header, ctx.subject),
          state: "CA",
          zip: street.zip,
          price: parseMoney(d.get("asking price") ?? null),
          units,
          property_type: findPropertyType(typeText, units),
          cap_rate: parsePercent(d.get("cap rate") ?? null),
          year_built: parseInteger(d.get("year built") ?? null),
          building_sqft: parseInteger(
            d.get("square footage") ?? d.get("net rentable (sqft)") ?? null,
          ),
          lot_sqft: lotSqft(d),
          apn: d.get("apn") ?? null,
          broker_name: broker ?? null,
          listing_url: null,
        },
        statedPricePerUnit: parseMoney(d.get("price/unit") ?? null),
        notes,
      },
    ];
  },

  explainEmpty(ctx) {
    const s = sections(ctx);
    if (!s) return null;
    const d = s.details;
    const facts = [
      d.get("units") ? `${d.get("units")} units` : null,
      d.get("asking price") ? `asking ${d.get("asking price")}` : null,
      d.get("apn") ? `APN ${d.get("apn")}` : null,
    ].filter(Boolean);
    return `Crexi left the street address out of this email ("${title(s, ctx.subject)}"${
      facts.length ? `: ${facts.join(", ")}` : ""
    }). No listing was created. Open the listing on Crexi and add it by hand in Deal Finder.`;
  },
};
