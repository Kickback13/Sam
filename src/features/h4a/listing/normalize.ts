/**
 * Address + APN normalization for Deal Finder dedupe. Pure and unit-tested.
 *
 * Two listings are the same building when their APNs match, or when their
 * normalized street line matches AND their ZIP (or city) matches — unless both
 * have APNs and those differ. See dedupe.ts and docs/DECISIONS.md (ADR-019).
 */

const SUFFIXES: Record<string, string> = {
  street: "st",
  str: "st",
  avenue: "ave",
  av: "ave",
  aven: "ave",
  boulevard: "blvd",
  blv: "blvd",
  drive: "dr",
  drv: "dr",
  road: "rd",
  lane: "ln",
  court: "ct",
  place: "pl",
  terrace: "ter",
  terr: "ter",
  parkway: "pkwy",
  pky: "pkwy",
  highway: "hwy",
  circle: "cir",
  trail: "trl",
  square: "sq",
  alley: "aly",
  plaza: "plz",
  point: "pt",
  crossing: "xing",
  heights: "hts",
  center: "ctr",
  centre: "ctr",
  mount: "mt",
  mountain: "mtn",
  expressway: "expy",
  freeway: "fwy",
};

const DIRECTIONS: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

/** Unit/suite designators are dropped: Deal Finder tracks whole buildings. */
const UNIT_RE =
  /(?:,?\s+|\s*,\s*)(?:apt|apartment|unit|units|ste|suite|bldg|building|spc|space|#)\.?\s*#?\s*[a-z0-9-]+\s*$/i;

/** "3100 Sample Avenue, Unit 4" → "3100 sample ave". Null when there's no street line. */
export function normalizeStreet(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(UNIT_RE, "");
  s = s.replace(/\s*-\s*/g, "-"); // "3100 - 3110" → "3100-3110"
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9/\- ]+/g, " ");
  const tokens = s.split(" ").filter(Boolean);
  const out = tokens.map((t) => SUFFIXES[t] ?? DIRECTIONS[t] ?? t);
  const result = out.join(" ").trim();
  return result || null;
}

export function normalizeCity(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

/** First five digits of a US ZIP ("92104-1234" → "92104"). */
export function zip5(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{5})(?:-?\d{4})?$/);
  return m ? m[1] : null;
}

/** APN digits only ("123-456-78-90" → "1234567890"); null unless 6–20 digits. */
export function normalizeApn(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 20 ? digits : null;
}

/** San Diego County APNs are 10 digits, written 123-456-78-90. */
export function formatApn(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = normalizeApn(raw);
  if (d && d.length === 10)
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
  return raw;
}

export type ListingKeys = {
  streetKey: string | null;
  apnKey: string | null;
  matchKeys: string[];
};

export function listingKeys(input: {
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  apn?: string | null;
}): ListingKeys {
  const streetKey = normalizeStreet(input.address);
  const apnKey = normalizeApn(input.apn);
  const keys: string[] = [];
  if (apnKey) keys.push(`apn:${apnKey}`);
  if (streetKey) {
    const z = zip5(input.zip);
    const c = normalizeCity(input.city);
    if (z) keys.push(`addr:${streetKey}|${z}`);
    if (c) keys.push(`addr:${streetKey}|${c}`);
    if (!z && !c) keys.push(`addr:${streetKey}|`);
  }
  return { streetKey, apnKey, matchKeys: keys };
}

const STATE_RE = /^(ca|calif|california)$/i;

/**
 * Split a one-line address ("3100 Sample Ave, San Diego, CA 92104") into parts.
 * Missing parts are null; the street line is kept as written.
 */
export function splitAddressLine(line: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const clean = line.replace(/\s+/g, " ").trim();
  const zipMatch = clean.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  let rest = zipMatch ? clean.slice(0, zipMatch.index).trim() : clean;
  rest = rest.replace(/,\s*$/, "");
  let state: string | null = null;
  const stateMatch = rest.match(/[,\s]\s*(CA|Calif\.?|California)\s*$/i);
  if (stateMatch) {
    state = "CA";
    rest = rest.slice(0, stateMatch.index).trim().replace(/,\s*$/, "");
  }
  const parts = rest
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const address = parts[0] ?? null;
  const city = parts.length > 1 ? parts[parts.length - 1] : null;
  return {
    address,
    city: city && !STATE_RE.test(city) ? city : null,
    state,
    zip: zipMatch ? zipMatch[0].trim() : null,
  };
}
