/**
 * Buy-box scoring (pure). The single source of truth for listing scores:
 * every ingestion path and every buy-box edit calls scoreListing() and the
 * database stores the result with the buy-box version it used.
 *
 * Rules
 *  - Only criteria the buy box sets count. Each has a weight; the score is the
 *    share of active weight that passes, 0–100, rounded.
 *  - Missing listing data is "unknown" and earns nothing — never a pass.
 *  - Boundaries are inclusive ("max $200,000" passes at exactly $200,000).
 *  - An empty buy box gives no score (null), not 0 or 100.
 */
import { formatCurrency, formatNumber } from "@/lib/format";

export type BuyBox = {
  zips: string[];
  cities: string[];
  submarkets: string[];
  propertyTypes: string[];
  unitsMin: number | null;
  unitsMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  maxPricePerUnit: number | null;
  yearBuiltMin: number | null;
  yearBuiltMax: number | null;
  alertThreshold: number;
  version: number;
};

export type ScoringListing = {
  zip?: string | null;
  city?: string | null;
  submarket?: string | null;
  property_type?: string | null;
  units?: number | null;
  price?: number | null;
  year_built?: number | null;
};

export type CriterionKey =
  "location" | "property_type" | "units" | "price" | "price_per_unit" | "year_built";
export type CriterionStatus = "pass" | "miss" | "unknown";

export type CriterionResult = {
  key: CriterionKey;
  label: string;
  status: CriterionStatus;
  weight: number;
  /** The listing's value, formatted ("$206,250"), or null when unknown. */
  actual: string | null;
  /** The buy-box rule, formatted ("≤ $200,000"). */
  target: string;
  /** One plain-English line: "Price/unit $206,250, over your $200,000 max." */
  message: string;
};

export type ScoreResult = {
  score: number | null;
  breakdown: CriterionResult[];
  counts: Record<CriterionStatus, number>;
};

export const CRITERION_WEIGHTS: Record<CriterionKey, number> = {
  location: 25,
  price_per_unit: 20,
  units: 20,
  price: 15,
  property_type: 10,
  year_built: 10,
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  multifamily: "Multifamily",
  duplex: "Duplex",
  triplex: "Triplex",
  fourplex: "Fourplex",
  mixed_use: "Mixed use",
  commercial: "Commercial",
  land: "Land",
  other: "Other",
};

export const EMPTY_BUY_BOX: BuyBox = {
  zips: [],
  cities: [],
  submarkets: [],
  propertyTypes: [],
  unitsMin: null,
  unitsMax: null,
  priceMin: null,
  priceMax: null,
  maxPricePerUnit: null,
  yearBuiltMin: null,
  yearBuiltMax: null,
  alertThreshold: 70,
  version: 0,
};

export function isBuyBoxEmpty(b: BuyBox | null | undefined): boolean {
  if (!b) return true;
  return (
    b.zips.length === 0 &&
    b.cities.length === 0 &&
    b.submarkets.length === 0 &&
    b.propertyTypes.length === 0 &&
    b.unitsMin === null &&
    b.unitsMax === null &&
    b.priceMin === null &&
    b.priceMax === null &&
    b.maxPricePerUnit === null &&
    b.yearBuiltMin === null &&
    b.yearBuiltMax === null
  );
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function zip5(v: string | null | undefined): string | null {
  const m = v?.trim().match(/^(\d{5})/);
  return m ? m[1] : null;
}

/** "≤ $200,000" · "$1,000,000–$5,000,000" · "≥ 10 units" */
function rangeText(min: number | null, max: number | null, fmt: (n: number) => string): string {
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}`;
  if (min !== null) return `≥ ${fmt(min)}`;
  return `≤ ${fmt(max as number)}`;
}

function rangeCheck(
  value: number,
  min: number | null,
  max: number | null,
): "pass" | "under" | "over" {
  if (min !== null && value < min) return "under";
  if (max !== null && value > max) return "over";
  return "pass";
}

const money = (n: number) => formatCurrency(n);
const plain = (n: number) => formatNumber(n);
const year = (n: number) => String(n);

function list(values: string[], max = 4): string {
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown} +${values.length - max} more` : shown;
}

function locationCriterion(l: ScoringListing, b: BuyBox): CriterionResult | null {
  const active = b.zips.length + b.cities.length + b.submarkets.length > 0;
  if (!active) return null;
  const weight = CRITERION_WEIGHTS.location;
  const target = [
    b.zips.length ? `ZIPs ${list(b.zips)}` : null,
    b.cities.length ? `cities ${list(b.cities)}` : null,
    b.submarkets.length ? `submarkets ${list(b.submarkets)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const z = zip5(l.zip);
  const city = l.city?.trim() || null;
  const sub = l.submarket?.trim() || null;

  const checks: { known: boolean; match: boolean; text: string }[] = [];
  if (b.zips.length)
    checks.push({ known: !!z, match: !!z && b.zips.some((x) => zip5(x) === z), text: `ZIP ${z}` });
  if (b.cities.length)
    checks.push({
      known: !!city,
      match: !!city && b.cities.some((x) => same(x, city)),
      text: `City ${city}`,
    });
  if (b.submarkets.length)
    checks.push({
      known: !!sub,
      match: !!sub && b.submarkets.some((x) => same(x, sub)),
      text: `Submarket ${sub}`,
    });

  const actual = [z ? `ZIP ${z}` : null, city, sub].filter(Boolean).join(" · ") || null;
  const hit = checks.find((c) => c.match);
  if (hit)
    return {
      key: "location",
      label: "Location",
      status: "pass",
      weight,
      actual,
      target,
      message: `${hit.text} is in your buy box.`,
    };
  if (checks.some((c) => c.known))
    return {
      key: "location",
      label: "Location",
      status: "miss",
      weight,
      actual,
      target,
      message: `${actual} isn't in your buy box locations.`,
    };
  return {
    key: "location",
    label: "Location",
    status: "unknown",
    weight,
    actual: null,
    target,
    message: "Location unknown — this listing has no ZIP, city or submarket to check.",
  };
}

function rangeCriterion(
  key: CriterionKey,
  label: string,
  value: number | null,
  min: number | null,
  max: number | null,
  fmt: (n: number) => string,
  words: { value: (v: string) => string; unknown: string },
): CriterionResult | null {
  if (min === null && max === null) return null;
  const weight = CRITERION_WEIGHTS[key];
  const target = rangeText(min, max, fmt);
  if (value === null)
    return { key, label, status: "unknown", weight, actual: null, target, message: words.unknown };
  const actual = fmt(value);
  const check = rangeCheck(value, min, max);
  const lead = words.value(actual);
  if (check === "pass") {
    const within =
      min !== null && max !== null
        ? `within your ${target} range`
        : min !== null
          ? `at or above your ${fmt(min)} minimum`
          : `at or under your ${fmt(max as number)} max`;
    return { key, label, status: "pass", weight, actual, target, message: `${lead}, ${within}.` };
  }
  const message =
    check === "over"
      ? `${lead}, over your ${fmt(max as number)} max.`
      : `${lead}, under your ${fmt(min as number)} minimum.`;
  return { key, label, status: "miss", weight, actual, target, message };
}

function typeCriterion(l: ScoringListing, b: BuyBox): CriterionResult | null {
  if (b.propertyTypes.length === 0) return null;
  const weight = CRITERION_WEIGHTS.property_type;
  const names = b.propertyTypes.map((t) => PROPERTY_TYPE_LABELS[t] ?? t);
  const target = list(names, 6);
  const t = l.property_type?.trim() || null;
  if (!t)
    return {
      key: "property_type",
      label: "Property type",
      status: "unknown",
      weight,
      actual: null,
      target,
      message: "Property type unknown.",
    };
  const name = PROPERTY_TYPE_LABELS[t] ?? t;
  const ok = b.propertyTypes.includes(t);
  return {
    key: "property_type",
    label: "Property type",
    status: ok ? "pass" : "miss",
    weight,
    actual: name,
    target,
    message: ok
      ? `${name} is one of your property types.`
      : `${name} isn't one of your property types (${target}).`,
  };
}

export function scoreListing(listing: ScoringListing, buyBox: BuyBox | null): ScoreResult {
  const counts: Record<CriterionStatus, number> = { pass: 0, miss: 0, unknown: 0 };
  if (!buyBox || isBuyBoxEmpty(buyBox)) return { score: null, breakdown: [], counts };

  const units = num(listing.units);
  const price = num(listing.price);
  // Same rounding as the database column (price ÷ units, to the cent).
  const ppu =
    price !== null && units !== null && units > 0 ? Math.round((price / units) * 100) / 100 : null;

  const breakdown = [
    locationCriterion(listing, buyBox),
    typeCriterion(listing, buyBox),
    rangeCriterion("units", "Units", units, buyBox.unitsMin, buyBox.unitsMax, plain, {
      value: (v) => `${v} ${units === 1 ? "unit" : "units"}`,
      unknown: "Units unknown.",
    }),
    rangeCriterion("price", "Price", price, buyBox.priceMin, buyBox.priceMax, money, {
      value: (v) => `Price ${v}`,
      unknown: "Price unknown.",
    }),
    rangeCriterion("price_per_unit", "Price/unit", ppu, null, buyBox.maxPricePerUnit, money, {
      value: (v) => `Price/unit ${v}`,
      unknown:
        price === null || units === null
          ? "Price/unit unknown — needs both price and units."
          : "Price/unit unknown — the listing shows 0 units.",
    }),
    rangeCriterion(
      "year_built",
      "Year built",
      num(listing.year_built),
      buyBox.yearBuiltMin,
      buyBox.yearBuiltMax,
      year,
      { value: (v) => `Built ${v}`, unknown: "Year built unknown." },
    ),
  ].filter((c): c is CriterionResult => c !== null);

  let active = 0;
  let earned = 0;
  for (const c of breakdown) {
    counts[c.status]++;
    active += c.weight;
    if (c.status === "pass") earned += c.weight;
  }
  const score = active === 0 ? null : Math.round((earned / active) * 100);
  return { score, breakdown, counts };
}

export function scoreBand(
  score: number | null | undefined,
): "high" | "medium" | "low" | "unscored" {
  if (score === null || score === undefined) return "unscored";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** Map a database row (snake_case, numerics as strings) to a BuyBox. */
export function buyBoxFromRow(row: Record<string, unknown> | null | undefined): BuyBox {
  if (!row) return { ...EMPTY_BUY_BOX };
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    zips: arr(row.zips),
    cities: arr(row.cities),
    submarkets: arr(row.submarkets),
    propertyTypes: arr(row.property_types),
    unitsMin: num(row.units_min),
    unitsMax: num(row.units_max),
    priceMin: num(row.price_min),
    priceMax: num(row.price_max),
    maxPricePerUnit: num(row.max_price_per_unit),
    yearBuiltMin: num(row.year_built_min),
    yearBuiltMax: num(row.year_built_max),
    alertThreshold: num(row.alert_threshold) ?? 70,
    version: num(row.version) ?? 0,
  };
}
