/**
 * Licensed property data (ownership, mortgage, foreclosure, tax) for Phase 3.
 *
 * Phase 3A ships the interface and a "Not connected" implementation. Sam picks
 * the provider (ATTOM, RentCast or PropertyRadar — compared in
 * docs/DECISIONS.md, ADR-026) and the account is created under his email;
 * 3B plugs the real adapter in here and nothing else changes. Never scrape.
 */

export type DataPoint<T> = {
  value: T;
  /** Shown on every value, e.g. "ATTOM property detail". */
  sourceLabel: string;
  fetchedAt: string;
};

export type PropertyDataRecord = {
  ownerName: DataPoint<string> | null;
  ownerMailingAddress: DataPoint<string> | null;
  ownershipYears: DataPoint<number> | null;
  mortgageLender: DataPoint<string> | null;
  mortgageAmount: DataPoint<number> | null;
  mortgageDate: DataPoint<string> | null;
  foreclosureStatus: DataPoint<string> | null;
  assessedValue: DataPoint<number> | null;
  annualTax: DataPoint<number> | null;
};

export type PropertyDataLookup =
  | { status: "found"; record: PropertyDataRecord }
  | { status: "not_found"; message: string }
  | { status: "not_connected"; message: string }
  | { status: "error"; message: string };

export interface PropertyDataAdapter {
  readonly name: string;
  readonly connected: boolean;
  lookup(query: {
    apn?: string | null;
    address: string;
    zip?: string | null;
  }): Promise<PropertyDataLookup>;
}

export const PROPERTY_DATA_NOT_CONNECTED =
  "Ownership, mortgage, foreclosure and tax data need a licensed data service. Sam picks the provider; until then, nothing here is filled in.";

export class NotConnectedPropertyData implements PropertyDataAdapter {
  readonly name = "Property data service";
  readonly connected = false;
  async lookup(): Promise<PropertyDataLookup> {
    return { status: "not_connected", message: PROPERTY_DATA_NOT_CONNECTED };
  }
}

/** The adapter in use. Phase 3B swaps this for the provider Sam chooses. */
export function propertyDataAdapter(): PropertyDataAdapter {
  return new NotConnectedPropertyData();
}
