/**
 * RentCast (Phase 3B, ADR-034): licensed property records and value / rent estimates.
 *
 * API facts used (from RentCast's public API reference, cross-checked against open-source
 * clients): base https://api.rentcast.io/v1, header `X-Api-Key`, GET /properties?address=…
 * (an array of records; 404 = no match), GET /avm/value and /avm/rent/long-term?address=…,
 * 401 = bad key, 429 = rate limit. Every field is treated as optional: a field RentCast
 * doesn't send stays blank here instead of being guessed. Never scrape; never estimate.
 */

export const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";
export const RENTCAST_SOURCE = "RentCast";

export function rentcastBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.RENTCAST_API_BASE || RENTCAST_BASE_URL;
}

export type RentCastAddress = {
  formattedAddress?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

type YearMap<T> = Record<string, T> | null | undefined;

export type RentCastProperty = RentCastAddress & {
  id?: string;
  county?: string | null;
  assessorID?: string | null;
  propertyType?: string | null;
  yearBuilt?: number | null;
  squareFootage?: number | null;
  lotSize?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  lastSaleDate?: string | null;
  lastSalePrice?: number | null;
  ownerOccupied?: boolean | null;
  features?: { unitCount?: number | null; [k: string]: unknown } | null;
  taxAssessments?: YearMap<{
    year?: number;
    value?: number | null;
    land?: number | null;
    improvements?: number | null;
  }>;
  propertyTaxes?: YearMap<{ year?: number; total?: number | null }>;
  owner?: {
    names?: string[] | null;
    type?: string | null;
    mailingAddress?: RentCastAddress | null;
  } | null;
  history?: YearMap<{ event?: string | null; date?: string | null; price?: number | null }>;
};

export type RentCastComparable = RentCastAddress & {
  id?: string;
  price?: number | null;
  squareFootage?: number | null;
  distance?: number | null;
  correlation?: number | null;
  daysOld?: number | null;
  propertyType?: string | null;
};

export type RentCastValueEstimate = {
  price?: number | null;
  priceRangeLow?: number | null;
  priceRangeHigh?: number | null;
  comparables?: RentCastComparable[] | null;
};

export type RentCastRentEstimate = {
  rent?: number | null;
  rentRangeLow?: number | null;
  rentRangeHigh?: number | null;
  comparables?: RentCastComparable[] | null;
};

export class RentCastError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "not_found" | "rate_limit" | "provider" | "network",
    readonly status?: number,
  ) {
    super(message);
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function formatAddress(a: RentCastAddress | null | undefined): string | null {
  if (!a) return null;
  if (str(a.formattedAddress)) return str(a.formattedAddress);
  const line = [str(a.addressLine1), str(a.addressLine2)].filter(Boolean).join(" ");
  const tail = [str(a.city), [str(a.state), str(a.zipCode)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [line, tail].filter(Boolean).join(", ") || null;
}

/** The most recent tax-year entry of a RentCast year map ("2024": {...}). */
function latestYear<T>(map: YearMap<T>): { year: number; entry: T } | null {
  if (!map || typeof map !== "object") return null;
  const years = Object.keys(map)
    .map((k) => ({ k, y: Number(k) }))
    .filter((x) => Number.isInteger(x.y))
    .sort((a, b) => b.y - a.y);
  return years.length ? { year: years[0].y, entry: map[years[0].k] } : null;
}

/** RentCast "Street, City, State, Zip" query for a property. */
export function addressQuery(p: {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [p.address, p.city, p.state || "CA", p.zip]
    .filter((x) => x && String(x).trim())
    .join(", ");
}

/** What the app keeps from a property record: each value with its own label. */
export type PropertyFacts = {
  ownerNames: string[];
  ownerType: string | null;
  ownerMailingAddress: string | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string | null; // YYYY-MM-DD
  lastSalePrice: number | null;
  assessedValue: number | null;
  assessedYear: number | null;
  annualTax: number | null;
  annualTaxYear: number | null;
  yearBuilt: number | null;
  buildingSqft: number | null;
  lotSqft: number | null;
  units: number | null;
  propertyType: string | null;
  apn: string | null;
  county: string | null;
  saleHistory: { date: string; price: number | null; event: string | null }[];
};

export function propertyFacts(r: RentCastProperty): PropertyFacts {
  const tax = latestYear(r.propertyTaxes);
  const assess = latestYear(r.taxAssessments);
  const history = r.history && typeof r.history === "object" ? Object.values(r.history) : [];
  return {
    ownerNames: (r.owner?.names ?? []).map((n) => str(n)).filter((n): n is string => Boolean(n)),
    ownerType: str(r.owner?.type),
    ownerMailingAddress: formatAddress(r.owner?.mailingAddress),
    ownerOccupied: typeof r.ownerOccupied === "boolean" ? r.ownerOccupied : null,
    lastSaleDate: str(r.lastSaleDate)?.slice(0, 10) ?? null,
    lastSalePrice: num(r.lastSalePrice),
    assessedValue: num(assess?.entry?.value),
    assessedYear: assess?.year ?? null,
    annualTax: num(tax?.entry?.total),
    annualTaxYear: tax?.year ?? null,
    yearBuilt: num(r.yearBuilt),
    buildingSqft: num(r.squareFootage),
    lotSqft: num(r.lotSize),
    units: num(r.features?.unitCount),
    propertyType: str(r.propertyType),
    apn: str(r.assessorID),
    county: str(r.county),
    saleHistory: history
      .map((h) => ({
        date: str(h?.date)?.slice(0, 10) ?? "",
        price: num(h?.price),
        event: str(h?.event),
      }))
      .filter((h) => h.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
  };
}

/** Pick the record for the property's own address from RentCast's result array. */
export function pickRecord(
  records: RentCastProperty[],
  zip: string | null | undefined,
): RentCastProperty | null {
  if (!records.length) return null;
  return records.find((r) => zip && str(r.zipCode) === zip) ?? records[0];
}

/**
 * Columns the app may fill on the property: only blanks, so nothing anyone entered or
 * verified is overwritten. Returns the patch and the field names it stamps with the source.
 */
export function blankFieldPatch(
  property: {
    last_sale_date: string | null;
    last_sale_price: number | string | null;
    assessed_value: number | string | null;
    year_built: number | null;
    building_sqft: number | null;
    lot_sqft: number | null;
    units: number | null;
    apn: string | null;
    county: string | null;
  },
  f: PropertyFacts,
): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  const set = (col: keyof typeof property, v: string | number | null) => {
    if (v !== null && (property[col] === null || property[col] === "")) patch[col] = v;
  };
  set("last_sale_date", f.lastSaleDate);
  set("last_sale_price", f.lastSalePrice);
  set("assessed_value", f.assessedValue);
  set("year_built", f.yearBuilt);
  set("building_sqft", f.buildingSqft);
  set("lot_sqft", f.lotSqft);
  set("units", f.units);
  set("apn", f.apn);
  set("county", f.county);
  return patch;
}

/** Small read-only client. Each call is ONE billable request; callers check the limit first. */
export class RentCastClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = RENTCAST_BASE_URL,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(
      path.replace(/^\//, ""),
      this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json", "X-Api-Key": this.apiKey },
        cache: "no-store",
      });
    } catch {
      throw new RentCastError("Couldn't reach RentCast. Try again in a minute.", "network");
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401 || res.status === 403)
      throw new RentCastError(
        "RentCast rejected the API key. An admin can update it in Settings → Integrations.",
        "auth",
        res.status,
      );
    if (res.status === 404)
      throw new RentCastError("RentCast has no record for this address.", "not_found", 404);
    if (res.status === 429)
      throw new RentCastError(
        "RentCast is rate-limiting requests. Try again in a minute.",
        "rate_limit",
        429,
      );
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message || body.error || "";
    } catch {
      /* not JSON */
    }
    throw new RentCastError(
      `RentCast couldn't answer (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
      "provider",
      res.status,
    );
  }

  propertyRecords(address: string): Promise<RentCastProperty[]> {
    return this.get<RentCastProperty[]>("/properties", { address, limit: "1" });
  }

  valueEstimate(address: string, propertyType?: string | null): Promise<RentCastValueEstimate> {
    return this.get("/avm/value", {
      address,
      ...(propertyType ? { propertyType } : {}),
      compCount: "5",
    });
  }

  rentEstimate(address: string, propertyType?: string | null): Promise<RentCastRentEstimate> {
    return this.get("/avm/rent/long-term", {
      address,
      ...(propertyType ? { propertyType } : {}),
      compCount: "5",
    });
  }
}

/** RentCast property type from ours: 2–4 units = Multi-Family, 5+ = Apartment. */
export function rentcastPropertyType(units: number | null | undefined): string | null {
  if (!units) return null;
  return units >= 5 ? "Apartment" : units >= 2 ? "Multi-Family" : null;
}
