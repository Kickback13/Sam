import { describe, expect, it, vi } from "vitest";

import {
  addressQuery,
  blankFieldPatch,
  formatAddress,
  pickRecord,
  propertyFacts,
  RentCastClient,
  RentCastError,
  rentcastPropertyType,
  type RentCastProperty,
} from "./rentcast";

const record: RentCastProperty = {
  id: "5500-Example-Ave,-San-Diego,-CA-92104",
  formattedAddress: "5500 Example Ave, San Diego, CA 92104",
  zipCode: "92104",
  county: "San Diego",
  assessorID: "453-123-45-00",
  propertyType: "Apartment",
  yearBuilt: 1972,
  squareFootage: 18400,
  lotSize: 21000,
  lastSaleDate: "2004-06-15T00:00:00.000Z",
  lastSalePrice: 1950000,
  ownerOccupied: false,
  features: { unitCount: 24 },
  taxAssessments: {
    "2023": { year: 2023, value: 2400000 },
    "2024": { year: 2024, value: 2450000, land: 900000, improvements: 1550000 },
  },
  propertyTaxes: { "2023": { year: 2023, total: 29000 }, "2024": { year: 2024, total: 29600 } },
  owner: {
    names: ["Example Family Trust"],
    type: "Organization",
    mailingAddress: { addressLine1: "PO Box 100", city: "La Jolla", state: "CA", zipCode: "92037" },
  },
  history: {
    "2004-06-15": { event: "Sale", date: "2004-06-15T00:00:00.000Z", price: 1950000 },
    "1998-02-01": { event: "Sale", date: "1998-02-01T00:00:00.000Z", price: 900000 },
  },
};

describe("propertyFacts", () => {
  it("keeps the latest tax year, the owner and the sale history", () => {
    const f = propertyFacts(record);
    expect(f).toMatchObject({
      ownerNames: ["Example Family Trust"],
      ownerType: "Organization",
      ownerMailingAddress: "PO Box 100, La Jolla, CA 92037",
      ownerOccupied: false,
      lastSaleDate: "2004-06-15",
      lastSalePrice: 1950000,
      assessedValue: 2450000,
      assessedYear: 2024,
      annualTax: 29600,
      annualTaxYear: 2024,
      units: 24,
      apn: "453-123-45-00",
    });
    expect(f.saleHistory.map((h) => h.date)).toEqual(["2004-06-15", "1998-02-01"]);
  });

  it("leaves missing fields blank instead of guessing", () => {
    const f = propertyFacts({ formattedAddress: "1 A St" });
    expect(f.ownerNames).toEqual([]);
    expect(f.assessedValue).toBeNull();
    expect(f.lastSaleDate).toBeNull();
    expect(f.saleHistory).toEqual([]);
  });
});

describe("blankFieldPatch", () => {
  it("fills only empty columns", () => {
    const patch = blankFieldPatch(
      {
        last_sale_date: null,
        last_sale_price: null,
        assessed_value: "2000000",
        year_built: 1970,
        building_sqft: null,
        lot_sqft: null,
        units: 24,
        apn: null,
        county: "",
      },
      propertyFacts(record),
    );
    expect(patch).toEqual({
      last_sale_date: "2004-06-15",
      last_sale_price: 1950000,
      building_sqft: 18400,
      lot_sqft: 21000,
      apn: "453-123-45-00",
      county: "San Diego",
    });
  });
});

describe("helpers", () => {
  it("formats addresses and builds the query", () => {
    expect(formatAddress({ formattedAddress: "X" })).toBe("X");
    expect(formatAddress(null)).toBeNull();
    expect(addressQuery({ address: "3683 University Ave", city: "San Diego", zip: "92104" })).toBe(
      "3683 University Ave, San Diego, CA, 92104",
    );
    expect(rentcastPropertyType(24)).toBe("Apartment");
    expect(rentcastPropertyType(3)).toBe("Multi-Family");
    expect(rentcastPropertyType(null)).toBeNull();
  });

  it("picks the record in the property's ZIP", () => {
    expect(pickRecord([{ zipCode: "92101" }, { zipCode: "92104" }], "92104")?.zipCode).toBe(
      "92104",
    );
    expect(pickRecord([], "92104")).toBeNull();
  });
});

describe("RentCastClient", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  it("sends the key header and the address", async () => {
    const f = vi.fn(
      async (...args: [URL | RequestInfo, RequestInit?]) => (void args, ok([record])),
    );
    const c = new RentCastClient(
      "key-1234567890abcdef",
      f as unknown as typeof fetch,
      "https://mock.test/v1",
    );
    await c.propertyRecords("1 A St, San Diego, CA, 92104");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(
      "https://mock.test/v1/properties?address=1+A+St%2C+San+Diego%2C+CA%2C+92104&limit=1",
    );
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("key-1234567890abcdef");
  });

  it("turns HTTP errors into clear kinds", async () => {
    for (const [status, kind] of [
      [401, "auth"],
      [404, "not_found"],
      [429, "rate_limit"],
      [500, "provider"],
    ] as const) {
      const c = new RentCastClient(
        "k",
        (async () => new Response("{}", { status })) as unknown as typeof fetch,
        "https://mock.test/v1",
      );
      await expect(c.valueEstimate("x")).rejects.toMatchObject({ kind });
    }
    const down = new RentCastClient("k", (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch);
    await expect(down.rentEstimate("x")).rejects.toBeInstanceOf(RentCastError);
  });
});
