/**
 * CSV column mapping for listing uploads (Sam's own exports and spreadsheets).
 * Same pattern as the Phase 1 contact importer: auto-map headers → preview +
 * dedupe → confirm → error report. Rows are re-validated on the server.
 */
import { normalizeHeader } from "@/lib/csv/mapping";
import { cleanText } from "@/lib/normalize";

import { parseInteger, parseMoney } from "../email/extract";
import { listingFieldsSchema, type ListingFields } from "../listing/schema";

export const LISTING_IMPORT_FIELDS = [
  { value: "address", label: "Street address" },
  { value: "full_address", label: "Full address (street, city, ZIP in one column)" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "ZIP" },
  { value: "apn", label: "APN / parcel number" },
  { value: "property_type", label: "Property type" },
  { value: "price", label: "Price" },
  { value: "units", label: "Units" },
  { value: "cap_rate", label: "Cap rate (%)" },
  { value: "year_built", label: "Year built" },
  { value: "building_sqft", label: "Building sq ft" },
  { value: "lot_sqft", label: "Lot sq ft" },
  { value: "lot_acres", label: "Lot acres" },
  { value: "submarket", label: "Submarket / neighborhood" },
  { value: "broker_name", label: "Broker name" },
  { value: "broker_company", label: "Brokerage" },
  { value: "broker_phone", label: "Broker phone" },
  { value: "broker_email", label: "Broker email" },
  { value: "listing_url", label: "Listing link" },
] as const;

export type ListingImportField = (typeof LISTING_IMPORT_FIELDS)[number]["value"];
export type ListingColumnMapping = Record<string, ListingImportField | "">;

const ALIASES: Record<ListingImportField, string[]> = {
  address: [
    "address",
    "street address",
    "property address",
    "street",
    "address 1",
    "address line 1",
    "site address",
    "situs address",
  ],
  full_address: ["full address", "location", "property location"],
  city: ["city", "property city"],
  state: ["state", "st", "property state"],
  zip: ["zip", "zip code", "zipcode", "postal code", "property zip"],
  apn: ["apn", "parcel", "parcel number", "parcel id", "assessor parcel number", "apn number"],
  property_type: ["property type", "type", "asset type", "property subtype", "subtype", "use"],
  price: ["price", "asking price", "list price", "listing price", "sale price", "asking"],
  units: ["units", "# of units", "number of units", "no of units", "unit count", "total units"],
  cap_rate: ["cap rate", "cap", "cap rate %", "capitalization rate"],
  year_built: ["year built", "built", "yr built", "year"],
  building_sqft: [
    "building sf",
    "building size",
    "building sq ft",
    "rba",
    "gba",
    "square feet",
    "sq ft",
    "sf",
    "building area",
  ],
  lot_sqft: ["lot size", "lot sf", "lot sq ft", "land sf", "land area sf", "lot size sf"],
  lot_acres: ["lot acres", "acres", "land acres", "lot size acres", "land area ac"],
  submarket: ["submarket", "neighborhood", "market", "sub market"],
  broker_name: [
    "broker",
    "broker name",
    "listing broker",
    "agent",
    "listing agent",
    "contact",
    "contact name",
  ],
  broker_company: ["brokerage", "broker company", "listing company", "company", "firm"],
  broker_phone: ["broker phone", "phone", "agent phone", "contact phone"],
  broker_email: ["broker email", "email", "agent email", "contact email"],
  listing_url: ["url", "link", "listing url", "listing link", "website", "listing"],
};

export function autoMapListings(headers: string[]): ListingColumnMapping {
  const mapping: ListingColumnMapping = {};
  const used = new Set<ListingImportField>();
  for (const header of headers) {
    const h = normalizeHeader(header);
    let match: ListingImportField | "" = "";
    for (const [field, aliases] of Object.entries(ALIASES) as [ListingImportField, string[]][]) {
      if (!used.has(field) && aliases.some((a) => normalizeHeader(a) === h)) {
        match = field;
        break;
      }
    }
    if (match) used.add(match);
    mapping[header] = match;
  }
  return mapping;
}

export function listingMappingProblems(mapping: ListingColumnMapping): string[] {
  const fields = Object.values(mapping).filter(Boolean);
  const problems: string[] = [];
  if (!fields.includes("address") && !fields.includes("full_address"))
    problems.push("Map a street address (or full address) column.");
  const counts = new Map<string, number>();
  for (const f of fields) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts)
    if (n > 1) problems.push(`"${f}" is mapped to ${n} columns — map it once.`);
  return problems;
}

const TYPE_WORDS: [RegExp, string][] = [
  [/\bduplex\b|\b2[\s-]?plex\b/i, "duplex"],
  [/\btriplex\b|\b3[\s-]?plex\b/i, "triplex"],
  [/\b(four|4)[\s-]?plex\b|\bquad/i, "fourplex"],
  [/mixed[\s-]?use/i, "mixed_use"],
  [/multi[\s-]?family|apartment|\bmf\b|residential income/i, "multifamily"],
  [/\bland\b|\blot\b|vacant/i, "land"],
  [/commercial|retail|office|industrial|warehouse/i, "commercial"],
];

export function parsePropertyType(raw: string | null): string | null {
  if (!raw) return null;
  for (const [re, type] of TYPE_WORDS) if (re.test(raw)) return type;
  return null;
}

/** Placeholders exports use instead of a number ("N/A", "Call for price", "-"). */
const NOT_A_VALUE =
  /^(n\/?a|-+|tbd|tba|none|call.*|not disclosed|undisclosed|unpriced|price on request|request)$/i;

export type RawListingRow = Record<string, string | undefined>;

export type ListingRowResult =
  { ok: true; fields: ListingFields } | { ok: false; errors: string[] };

function pick(
  row: RawListingRow,
  mapping: ListingColumnMapping,
  field: ListingImportField,
): string | null {
  for (const [header, target] of Object.entries(mapping))
    if (target === field) return cleanText(row[header]);
  return null;
}

/** One CSV row → validated listing fields (or the reasons it can't be imported). */
export function transformListingRow(
  row: RawListingRow,
  mapping: ListingColumnMapping,
): ListingRowResult {
  const errors: string[] = [];
  let address = pick(row, mapping, "address");
  let city = pick(row, mapping, "city");
  let zip = pick(row, mapping, "zip");
  const full = pick(row, mapping, "full_address");
  if (!address && full) {
    const m = full.match(/^(.*?),\s*([^,]+?),?\s*(?:CA|California)?\s*(\d{5}(?:-\d{4})?)?\s*$/i);
    if (m) {
      address = m[1].trim();
      city ??= m[2].trim();
      zip ??= m[3] ?? null;
    } else address = full;
  }

  const numberOrError = (field: ListingImportField, parse: (s: string) => number | null) => {
    const raw = pick(row, mapping, field);
    if (!raw || NOT_A_VALUE.test(raw)) return null;
    const n = parse(raw);
    if (n === null) errors.push(`${field.replace(/_/g, " ")}: "${raw}" isn't a number`);
    return n;
  };

  const lotAcres = numberOrError("lot_acres", (s) => {
    const n = Number(s.replace(/[^\d.]/g, ""));
    return s.trim() && Number.isFinite(n) ? n : null;
  });
  const rawType = pick(row, mapping, "property_type");
  const input = {
    address,
    city,
    state: pick(row, mapping, "state"),
    zip: zip ? zip.slice(0, 10) : null,
    apn: pick(row, mapping, "apn"),
    property_type: parsePropertyType(rawType),
    price: numberOrError("price", parseMoney),
    units: numberOrError("units", parseInteger),
    cap_rate: numberOrError("cap_rate", (s) => {
      const n = Number(s.replace(/[%\s]/g, ""));
      return s.trim() && Number.isFinite(n) ? n : null;
    }),
    year_built: numberOrError("year_built", parseInteger),
    building_sqft: numberOrError("building_sqft", parseInteger),
    lot_sqft:
      numberOrError("lot_sqft", parseInteger) ??
      (lotAcres !== null ? Math.round(lotAcres * 43560) : null),
    submarket: pick(row, mapping, "submarket"),
    broker_name: pick(row, mapping, "broker_name"),
    broker_company: pick(row, mapping, "broker_company"),
    broker_phone: pick(row, mapping, "broker_phone"),
    broker_email: pick(row, mapping, "broker_email"),
    listing_url: pick(row, mapping, "listing_url"),
  };

  const parsed = listingFieldsSchema.safeParse(input);
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors.push(`${String(issue.path[0] ?? "row").replace(/_/g, " ")}: ${issue.message}`);
  if (!parsed.success || errors.length) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, fields: parsed.data };
}
