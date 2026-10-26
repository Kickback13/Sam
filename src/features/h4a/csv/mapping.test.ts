import { describe, expect, it } from "vitest";

import {
  autoMapListings,
  listingMappingProblems,
  parsePropertyType,
  transformListingRow,
} from "./mapping";

const HEADERS = [
  "Property Address",
  "City",
  "Zip Code",
  "APN",
  "Property Type",
  "Asking Price",
  "# of Units",
  "Cap Rate",
  "Year Built",
  "Building SF",
  "Lot Size Acres",
  "Listing Broker",
  "Brokerage",
  "Broker Phone",
  "Broker Email",
  "Listing URL",
  "Internal notes",
];

describe("autoMapListings", () => {
  it("maps common export headers", () => {
    expect(autoMapListings(HEADERS)).toEqual({
      "Property Address": "address",
      City: "city",
      "Zip Code": "zip",
      APN: "apn",
      "Property Type": "property_type",
      "Asking Price": "price",
      "# of Units": "units",
      "Cap Rate": "cap_rate",
      "Year Built": "year_built",
      "Building SF": "building_sqft",
      "Lot Size Acres": "lot_acres",
      "Listing Broker": "broker_name",
      Brokerage: "broker_company",
      "Broker Phone": "broker_phone",
      "Broker Email": "broker_email",
      "Listing URL": "listing_url",
      "Internal notes": "",
    });
  });
  it("requires an address and single use of each field", () => {
    expect(listingMappingProblems({ City: "city" })).toEqual([
      "Map a street address (or full address) column.",
    ]);
    expect(listingMappingProblems({ A: "address", B: "price", C: "price" })).toEqual([
      '"price" is mapped to 2 columns — map it once.',
    ]);
    expect(listingMappingProblems({ A: "full_address" })).toEqual([]);
  });
});

describe("transformListingRow", () => {
  const mapping = autoMapListings(HEADERS);
  const row = {
    "Property Address": "3100 Sample Ave",
    City: "San Diego",
    "Zip Code": "92104",
    APN: "999-000-00-02",
    "Property Type": "Multi-Family",
    "Asking Price": "$4.95M",
    "# of Units": "24",
    "Cap Rate": "5.2%",
    "Year Built": "1964",
    "Building SF": "18,400",
    "Lot Size Acres": "0.32",
    "Listing Broker": "Pat Sample",
    Brokerage: "Example Realty Group",
    "Broker Phone": "619-555-0190",
    "Broker Email": "Pat.Sample@Example.com",
    "Listing URL": "https://example.com/listing/1",
    "Internal notes": "ignored",
  };

  it("converts and validates every field", () => {
    const r = transformListingRow(row, mapping);
    expect(r).toEqual({
      ok: true,
      fields: expect.objectContaining({
        address: "3100 Sample Ave",
        city: "San Diego",
        zip: "92104",
        state: "CA",
        apn: "999-000-00-02",
        property_type: "multifamily",
        price: 4_950_000,
        units: 24,
        cap_rate: 5.2,
        year_built: 1964,
        building_sqft: 18_400,
        lot_sqft: 13_939,
        broker_name: "Pat Sample",
        broker_company: "Example Realty Group",
        broker_phone: "619-555-0190",
        broker_email: "pat.sample@example.com",
        listing_url: "https://example.com/listing/1",
      }),
    });
  });

  it("treats N/A-style placeholders as blank", () => {
    const r = transformListingRow(
      { ...row, "Asking Price": "Call for price", "Cap Rate": "N/A" },
      mapping,
    );
    expect(r.ok && r.fields.price).toBeNull();
    expect(r.ok && r.fields.cap_rate).toBeNull();
  });

  it("reports every problem with the row", () => {
    const r = transformListingRow(
      {
        ...row,
        "Property Address": "",
        "# of Units": "lots",
        "Broker Email": "nope",
        "Listing URL": "example.com",
      },
      mapping,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual(
        expect.arrayContaining([
          'units: "lots" isn\'t a number',
          "address: Street address is required",
          "broker email: Enter a valid email",
          "listing url: Use a full link starting with https://",
        ]),
      );
  });

  it("splits a full-address column", () => {
    const r = transformListingRow(
      { Location: "4415 Example St, San Diego, CA 92116", Price: "2640000" },
      { Location: "full_address", Price: "price" },
    );
    expect(r).toMatchObject({
      ok: true,
      fields: { address: "4415 Example St", city: "San Diego", zip: "92116" },
    });
  });
});

describe("parsePropertyType", () => {
  it.each([
    ["Duplex", "duplex"],
    ["3-plex", "triplex"],
    ["Fourplex", "fourplex"],
    ["Quadplex", "fourplex"],
    ["Apartments", "multifamily"],
    ["Mixed Use", "mixed_use"],
    ["Retail", "commercial"],
    ["Vacant land", "land"],
    ["Hotel", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parsePropertyType(input)).toBe(expected);
  });
});
