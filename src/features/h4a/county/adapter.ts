/**
 * San Diego County public-record lookups for listing verification.
 *
 * Phase 2A ships the interface and a "Not connected" implementation: no
 * official, free, documented source we could confirm returns owner name,
 * units, year built and last sale under terms that fit our rules (see
 * docs/DECISIONS.md, ADR-024, for the options). Phase 2B plugs a real adapter
 * in here; nothing else changes. Never scrape the county websites.
 */

export type CountyRecord = {
  apn: string;
  situsAddress: string | null;
  ownerName: string | null;
  units: number | null;
  yearBuilt: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  /** Shown on every value: e.g. "SD County Assessor roll 2026". */
  sourceLabel: string;
  sourceUrl: string | null;
  fetchedAt: string;
};

export type CountyLookup =
  | { status: "found"; record: CountyRecord }
  | { status: "not_found"; message: string }
  | { status: "not_connected"; message: string }
  | { status: "error"; message: string };

export interface CountyRecordsAdapter {
  /** Short name for the UI ("San Diego County Assessor"). */
  readonly name: string;
  readonly connected: boolean;
  lookup(query: {
    apn?: string | null;
    address?: string | null;
    zip?: string | null;
  }): Promise<CountyLookup>;
}

export const NOT_CONNECTED_MESSAGE =
  "County data isn't connected yet. Verify by hand (for example on the SD County Assessor site) and use “Mark verified”.";

export class NotConnectedCountyAdapter implements CountyRecordsAdapter {
  readonly name = "San Diego County records";
  readonly connected = false;
  async lookup(): Promise<CountyLookup> {
    return { status: "not_connected", message: NOT_CONNECTED_MESSAGE };
  }
}

/** The adapter in use. Phase 2B swaps this for a real implementation. */
export function countyRecordsAdapter(): CountyRecordsAdapter {
  return new NotConnectedCountyAdapter();
}

/** Compare a county record with a listing: which fields disagree (for "Mismatch"). */
export function compareWithListing(
  record: CountyRecord,
  listing: { apn?: string | null; units?: number | null; year_built?: number | null },
): { field: "apn" | "units" | "year_built"; listing: string; county: string }[] {
  const out: { field: "apn" | "units" | "year_built"; listing: string; county: string }[] = [];
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  if (listing.apn && digits(listing.apn) !== digits(record.apn))
    out.push({ field: "apn", listing: listing.apn, county: record.apn });
  if (listing.units != null && record.units != null && listing.units !== record.units)
    out.push({ field: "units", listing: String(listing.units), county: String(record.units) });
  if (
    listing.year_built != null &&
    record.yearBuilt != null &&
    listing.year_built !== record.yearBuilt
  )
    out.push({
      field: "year_built",
      listing: String(listing.year_built),
      county: String(record.yearBuilt),
    });
  return out;
}
