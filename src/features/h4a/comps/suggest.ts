/**
 * Automatic comps (ADR-042): rank comparable sales and rents from data the workspace
 * already holds. Pure and unit-tested; the server loads the rows, this module decides.
 *
 * Three origins, none of which makes a new request or invents a number:
 *  - recorded_sale: another property's last sale price + date, with that field's own source;
 *  - saved_comp:    a comp already saved on another property, source and as-of kept as entered;
 *  - rentcast:      a comparable inside a RentCast estimate this property already fetched.
 *    RentCast comparables are listings, so a sale one is labeled "list price, not a sale".
 *
 * A suggestion is never saved by itself: a person adds it, and the server recomputes it by
 * key so the numbers saved are exactly the ones stored here.
 */

import type { FieldSources } from "@/lib/field-sources";

import type { CompInput } from "../underwriting/schema";

export const SUGGEST_LIMITS = {
  /** Sale comps older than this (sale date, else as-of) are skipped. */
  maxSaleAgeMonths: 36,
  /** Rent comps older than this (as-of) are skipped. */
  maxRentAgeMonths: 24,
  /** With coordinates on both sides, farther than this is skipped. */
  maxMiles: 3,
  /** 5+ unit subjects: comps between 1/4x and 4x the unit count. */
  unitRatio: 4,
  /** Shown per kind. */
  perKind: 8,
} as const;

export type CompOrigin = "recorded_sale" | "saved_comp" | "rentcast";

export type CompSubject = {
  id: string;
  address: string;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  units: number | null;
  property_type: string | null;
};

export type CompCandidate = {
  /** Stable id the add action recomputes: "sale:<propertyId>", "comp:<compId>", "rc:<pullId>:<i>". */
  key: string;
  kind: "sale" | "rent";
  origin: CompOrigin;
  address: string;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  units: number | null;
  building_sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  price: number | null;
  sale_date: string | null;
  cap_rate: number | null;
  unit_type: string | null;
  monthly_rent: number | null;
  /** Distance the source itself reported (RentCast); otherwise computed from coordinates. */
  reported_miles: number | null;
  source_label: string;
  source_url: string | null;
  as_of: string;
  notes: string | null;
  /** The other property this came from (recorded sales and saved comps). */
  from_property_id: string | null;
};

export type Nearness =
  { type: "miles"; miles: number } | { type: "zip"; zip: string } | { type: "city"; city: string };

export type CompSuggestion = CompCandidate & {
  score: number;
  nearness: Nearness;
  distance_miles: number | null;
  /** Months between the sale (or as-of) date and now. */
  age_months: number;
  price_per_unit: number | null;
};

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Calendar date (YYYY-MM-DD) of an instant in Pacific time, the app's business day. */
export function pacificDate(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const STREET_WORDS: Record<string, string> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  boulevard: "blvd",
  drive: "dr",
  road: "rd",
  court: "ct",
  place: "pl",
  lane: "ln",
  terrace: "ter",
  circle: "cir",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

/**
 * Street line in a comparable form, so "200 Sample Street, San Diego, CA 92104" and
 * "200 sample st" match. Only the part before the first comma counts.
 */
export function streetKey(address: string): string {
  return (address.split(",")[0] ?? "")
    .toLowerCase()
    .replace(/[#.]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(" ");
}

function monthsBetween(from: string, now: Date): number {
  const d = new Date(`${from}T12:00:00Z`);
  return Math.max(0, (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
}

const RESIDENTIAL = new Set(["multifamily", "duplex", "triplex", "fourplex", "mixed_use"]);
const COMMERCIAL = new Set(["commercial", "mixed_use"]);

/** Same kind of building, when both sides say. Unknown types don't exclude. */
export function typesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return true;
  if (a === "land" || b === "land") return false;
  if (RESIDENTIAL.has(a) && RESIDENTIAL.has(b)) return true;
  if (COMMERCIAL.has(a) && COMMERCIAL.has(b)) return true;
  return a === "other" || b === "other";
}

/** 2–4 units are compared with 2–4; 5+ with 5+ within a 4x band. Unknowns pass. */
export function unitsCompatible(subject: number | null, comp: number | null): boolean {
  if (!subject || !comp) return true;
  if (subject <= 4) return comp <= 4;
  if (comp <= 4) return false;
  const ratio = comp / subject;
  return ratio <= SUGGEST_LIMITS.unitRatio && ratio >= 1 / SUGGEST_LIMITS.unitRatio;
}

// ---------------------------------------------------------------------------
// Building candidates from stored rows.
// ---------------------------------------------------------------------------

export type RecordedSaleRow = {
  id: string;
  name: string | null;
  address: string;
  city: string | null;
  zip: string | null;
  lat: number | string | null;
  lng: number | string | null;
  units: number | null;
  building_sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  last_sale_price: number | string | null;
  last_sale_date: string | null;
  field_sources: FieldSources;
};

/** Another property's last recorded sale, labeled with the source of its price. */
export function fromRecordedSale(p: RecordedSaleRow): CompCandidate | null {
  const price = toNum(p.last_sale_price);
  const saleDate = isoDate(p.last_sale_date);
  if (!price || price <= 0 || !saleDate) return null;
  const src = p.field_sources.last_sale_price ?? p.field_sources.last_sale_date;
  if (!src) return null; // a number without a source is never suggested
  return {
    key: `sale:${p.id}`,
    kind: "sale",
    origin: "recorded_sale",
    address: p.address,
    city: p.city,
    zip: p.zip,
    lat: toNum(p.lat),
    lng: toNum(p.lng),
    units: p.units,
    building_sqft: p.building_sqft,
    year_built: p.year_built,
    property_type: p.property_type,
    price,
    sale_date: saleDate,
    cap_rate: null,
    unit_type: null,
    monthly_rent: null,
    reported_miles: null,
    source_label: clip(`Last sale on file · ${src.label}`, 200),
    source_url: src.url && /^https?:\/\//i.test(src.url) ? src.url : null,
    as_of: pacificDate(src.fetched_at),
    notes: null,
    from_property_id: p.id,
  };
}

export type SavedCompRow = {
  id: string;
  property_id: string;
  kind: "sale" | "rent";
  address: string;
  city: string | null;
  zip: string | null;
  units: number | null;
  building_sqft: number | null;
  year_built: number | null;
  price: number | string | null;
  sale_date: string | null;
  cap_rate: number | string | null;
  unit_type: string | null;
  monthly_rent: number | string | null;
  source_label: string;
  source_url: string | null;
  as_of: string;
  notes: string | null;
};

/** A comp saved on another property: same numbers, same source, same as-of. */
export function fromSavedComp(c: SavedCompRow): CompCandidate {
  return {
    key: `comp:${c.id}`,
    kind: c.kind,
    origin: "saved_comp",
    address: c.address,
    city: c.city,
    zip: c.zip,
    lat: null,
    lng: null,
    units: c.units,
    building_sqft: c.building_sqft,
    year_built: c.year_built,
    property_type: null,
    price: toNum(c.price),
    sale_date: isoDate(c.sale_date),
    cap_rate: toNum(c.cap_rate),
    unit_type: c.unit_type,
    monthly_rent: toNum(c.monthly_rent),
    // Its distance was measured from a different property, so it isn't reused.
    reported_miles: null,
    source_label: c.source_label,
    source_url: c.source_url,
    as_of: c.as_of,
    notes: c.notes,
    from_property_id: c.property_id,
  };
}

/** The fields the app reads from a RentCast comparable; everything is optional. */
export type RentCastComparableRow = {
  formattedAddress?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  price?: number | null;
  squareFootage?: number | null;
  yearBuilt?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  distance?: number | null;
  listedDate?: string | null;
  removedDate?: string | null;
  status?: string | null;
};

export type RentCastPull = {
  id: string;
  kind: "value" | "rent";
  fetched_at: string;
  comparables: unknown;
};

/** Comparables inside an already-fetched RentCast estimate. No request is made. */
export function fromRentCastPull(pull: RentCastPull): CompCandidate[] {
  if (!Array.isArray(pull.comparables)) return [];
  const out: CompCandidate[] = [];
  pull.comparables.slice(0, 25).forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const c = raw as RentCastComparableRow;
    const address = str(c.formattedAddress) ?? str(c.addressLine1);
    const price = toNum(c.price);
    if (!address || !price || price <= 0) return;
    const beds = toNum(c.bedrooms);
    const baths = toNum(c.bathrooms);
    const listed = isoDate(c.listedDate);
    const status = str(c.status);
    const detail = [
      status ? `status ${status.toLowerCase()}` : null,
      listed ? `listed ${listed}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const sale = pull.kind === "value";
    const miles = toNum(c.distance);
    out.push({
      key: `rc:${pull.id}:${i}`,
      kind: sale ? "sale" : "rent",
      origin: "rentcast",
      address: clip(address, 300),
      city: str(c.city),
      zip: str(c.zipCode),
      lat: toNum(c.latitude),
      lng: toNum(c.longitude),
      units: null,
      building_sqft: toNum(c.squareFootage),
      year_built: toNum(c.yearBuilt),
      property_type: null,
      price: sale ? price : null,
      sale_date: null,
      cap_rate: null,
      unit_type:
        !sale && beds !== null
          ? clip(`${beds === 0 ? "Studio" : `${beds}BR`}${baths !== null ? `/${baths}BA` : ""}`, 40)
          : null,
      monthly_rent: sale ? null : price,
      reported_miles: miles !== null && miles >= 0 ? miles : null,
      source_label: sale
        ? "RentCast value estimate comparable"
        : "RentCast rent estimate comparable",
      source_url: null,
      as_of: pacificDate(pull.fetched_at),
      notes: clip(
        sale
          ? `RentCast comparable: list price, not a recorded sale${detail ? ` (${detail})` : ""}.`
          : `RentCast comparable: asking rent${detail ? ` (${detail})` : ""}.`,
        2000,
      ),
      from_property_id: null,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Ranking.
// ---------------------------------------------------------------------------

const ORIGIN_RANK: Record<CompOrigin, number> = { recorded_sale: 0, saved_comp: 1, rentcast: 2 };

function nearness(subject: CompSubject, c: CompCandidate): Nearness | null {
  let miles = c.reported_miles;
  if (
    miles === null &&
    subject.lat !== null &&
    subject.lng !== null &&
    c.lat !== null &&
    c.lng !== null
  )
    miles = haversineMiles({ lat: subject.lat, lng: subject.lng }, { lat: c.lat, lng: c.lng });
  if (miles !== null) return miles <= SUGGEST_LIMITS.maxMiles ? { type: "miles", miles } : null;
  if (subject.zip && c.zip && subject.zip.slice(0, 5) === c.zip.slice(0, 5))
    return { type: "zip", zip: subject.zip.slice(0, 5) };
  if (subject.city && c.city && subject.city.trim().toLowerCase() === c.city.trim().toLowerCase())
    return { type: "city", city: subject.city.trim() };
  return null;
}

/**
 * Filter, score (0–100: location 40, size 30, recency 30) and rank candidates for a subject.
 * Skips the subject itself, anything already saved as a comp for it, and duplicates
 * (one per street address and kind: the most direct origin, then the newest).
 */
export function rankCompSuggestions(
  subject: CompSubject,
  candidates: CompCandidate[],
  existing: { kind: "sale" | "rent"; address: string }[],
  now: Date = new Date(),
): { sale: CompSuggestion[]; rent: CompSuggestion[] } {
  const subjectKey = streetKey(subject.address);
  const taken = new Set(existing.map((e) => `${e.kind}|${streetKey(e.address)}`));
  const best = new Map<string, CompSuggestion>();

  for (const c of candidates) {
    if (c.from_property_id === subject.id && c.origin === "recorded_sale") continue;
    const addrKey = streetKey(c.address);
    if (!addrKey || addrKey === subjectKey) continue;
    const dupKey = `${c.kind}|${addrKey}`;
    if (taken.has(dupKey)) continue;
    if (c.kind === "sale" && !c.price) continue;
    if (c.kind === "rent" && !c.monthly_rent) continue;
    if (!typesCompatible(subject.property_type, c.property_type)) continue;
    if (c.kind === "sale" && !unitsCompatible(subject.units, c.units)) continue;

    const dated = c.sale_date ?? c.as_of;
    const age = monthsBetween(dated, now);
    const maxAge =
      c.kind === "sale" ? SUGGEST_LIMITS.maxSaleAgeMonths : SUGGEST_LIMITS.maxRentAgeMonths;
    if (age > maxAge) continue;

    const near = nearness(subject, c);
    if (!near) continue;

    const loc =
      near.type === "miles"
        ? 40 * (1 - near.miles / SUGGEST_LIMITS.maxMiles) // 40 next door, 0 at the limit
        : near.type === "zip"
          ? 26
          : 12;
    const size =
      c.kind === "rent"
        ? 15
        : subject.units && c.units
          ? 30 *
            Math.max(
              0,
              1 - Math.abs(Math.log(c.units / subject.units)) / Math.log(SUGGEST_LIMITS.unitRatio),
            )
          : 10;
    const recency = 30 * Math.max(0, 1 - age / maxAge);
    const score = Math.round(Math.max(0, Math.min(100, loc + size + recency)));

    const suggestion: CompSuggestion = {
      ...c,
      score,
      nearness: near,
      distance_miles: near.type === "miles" ? Math.round(near.miles * 100) / 100 : null,
      age_months: Math.round(age),
      price_per_unit:
        c.kind === "sale" && c.price && c.units
          ? Math.round((c.price / c.units) * 100) / 100
          : null,
    };
    const prev = best.get(dupKey);
    if (
      !prev ||
      ORIGIN_RANK[c.origin] < ORIGIN_RANK[prev.origin] ||
      (ORIGIN_RANK[c.origin] === ORIGIN_RANK[prev.origin] && dated > (prev.sale_date ?? prev.as_of))
    )
      best.set(dupKey, suggestion);
  }

  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return {
    sale: sorted.filter((s) => s.kind === "sale").slice(0, SUGGEST_LIMITS.perKind),
    rent: sorted.filter((s) => s.kind === "rent").slice(0, SUGGEST_LIMITS.perKind),
  };
}

/** The row to insert for a suggestion: every value as stored, with its source and as-of. */
export function suggestionToCompInput(s: CompSuggestion): CompInput {
  return {
    kind: s.kind,
    address: clip(s.address, 300),
    city: s.city ? clip(s.city, 100) : null,
    zip: s.zip ? clip(s.zip, 20) : null,
    units: s.units && s.units >= 1 ? s.units : null,
    building_sqft:
      s.building_sqft !== null && s.building_sqft >= 0 ? Math.round(s.building_sqft) : null,
    year_built:
      s.year_built !== null && s.year_built >= 1700 && s.year_built <= 2100 ? s.year_built : null,
    price: s.kind === "sale" ? s.price : null,
    sale_date: s.sale_date,
    cap_rate: s.cap_rate,
    unit_type: s.unit_type,
    monthly_rent: s.kind === "rent" ? s.monthly_rent : null,
    distance_miles: s.distance_miles,
    source_label: clip(s.source_label, 200),
    source_url: s.source_url,
    as_of: s.as_of,
    notes: s.notes ? clip(s.notes, 2000) : null,
  };
}
