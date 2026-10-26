import { describe, expect, it } from "vitest";

import {
  buyBoxFromRow,
  EMPTY_BUY_BOX,
  isBuyBoxEmpty,
  scoreBand,
  scoreListing,
  type BuyBox,
} from "./score";

const box = (over: Partial<BuyBox> = {}): BuyBox => ({ ...EMPTY_BUY_BOX, version: 1, ...over });

const SAMPLE = {
  zip: "92104",
  city: "San Diego",
  submarket: "North Park",
  property_type: "multifamily",
  units: 24,
  price: 4_950_000,
  year_built: 1964,
};

describe("scoreListing", () => {
  it("gives no score for an empty buy box", () => {
    expect(scoreListing(SAMPLE, box())).toEqual({
      score: null,
      breakdown: [],
      counts: { pass: 0, miss: 0, unknown: 0 },
    });
    expect(scoreListing(SAMPLE, null).score).toBeNull();
  });

  it("explains a miss with the actual value (the brief's example)", () => {
    const r = scoreListing(SAMPLE, box({ maxPricePerUnit: 200_000 }));
    expect(r.score).toBe(0);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]).toMatchObject({
      key: "price_per_unit",
      status: "miss",
      actual: "$206,250",
      target: "≤ $200,000",
      message: "Price/unit $206,250, over your $200,000 max.",
    });
  });

  it("scores 100 when every set criterion passes", () => {
    const r = scoreListing(
      SAMPLE,
      box({
        zips: ["92104"],
        propertyTypes: ["multifamily", "fourplex"],
        unitsMin: 10,
        unitsMax: 60,
        priceMin: 1_000_000,
        priceMax: 8_000_000,
        maxPricePerUnit: 250_000,
        yearBuiltMin: 1950,
        yearBuiltMax: 2000,
      }),
    );
    expect(r.score).toBe(100);
    expect(r.counts).toEqual({ pass: 6, miss: 0, unknown: 0 });
    expect(r.breakdown.map((c) => c.key)).toEqual([
      "location",
      "property_type",
      "units",
      "price",
      "price_per_unit",
      "year_built",
    ]);
  });

  it("weights criteria (location 25, units 20, ppu 20, price 15, type 10, year 10)", () => {
    // Location passes (25), units miss (20) → 25 / 45 = 56%.
    const r = scoreListing(SAMPLE, box({ cities: ["San Diego"], unitsMin: 30 }));
    expect(r.score).toBe(56);
    expect(r.breakdown.find((c) => c.key === "units")?.message).toBe(
      "24 units, under your 30 minimum.",
    );
  });

  it("treats missing data as unknown — never a pass", () => {
    const r = scoreListing(
      {
        zip: null,
        city: null,
        submarket: null,
        property_type: null,
        units: null,
        price: null,
        year_built: null,
      },
      box({
        zips: ["92104"],
        unitsMin: 2,
        maxPricePerUnit: 300_000,
        propertyTypes: ["duplex"],
        yearBuiltMin: 1900,
      }),
    );
    expect(r.score).toBe(0);
    expect(r.counts).toEqual({ pass: 0, miss: 0, unknown: 5 });
    expect(r.breakdown.every((c) => c.actual === null)).toBe(true);
    expect(r.breakdown.find((c) => c.key === "price_per_unit")?.message).toBe(
      "Price/unit unknown — needs both price and units.",
    );
  });

  it("price per unit is unknown when units is 0", () => {
    const r = scoreListing({ ...SAMPLE, units: 0 }, box({ maxPricePerUnit: 300_000 }));
    expect(r.breakdown[0]).toMatchObject({
      status: "unknown",
      message: "Price/unit unknown — the listing shows 0 units.",
    });
  });

  it("includes boundaries (inclusive min and max)", () => {
    const exact = { ...SAMPLE, units: 24, price: 4_800_000 }; // $200,000/unit exactly
    expect(scoreListing(exact, box({ maxPricePerUnit: 200_000 })).score).toBe(100);
    expect(scoreListing(exact, box({ unitsMin: 24, unitsMax: 24 })).score).toBe(100);
    expect(scoreListing(exact, box({ priceMin: 4_800_000, priceMax: 4_800_000 })).score).toBe(100);
    expect(scoreListing(exact, box({ yearBuiltMin: 1964, yearBuiltMax: 1964 })).score).toBe(100);
    // One cent over the max is a miss.
    expect(
      scoreListing({ ...exact, price: 4_800_000.24 }, box({ maxPricePerUnit: 200_000 })).score,
    ).toBe(0);
    expect(scoreListing({ ...exact, units: 25 }, box({ unitsMax: 24 })).score).toBe(0);
    expect(
      scoreListing({ ...exact, year_built: 1963 }, box({ yearBuiltMin: 1964 })).breakdown[0]
        .message,
    ).toBe("Built 1963, under your 1964 minimum.");
  });

  it("location: passes if any list matches, misses if a known value doesn't, unknown otherwise", () => {
    const b = box({ zips: ["92104", "92116"], cities: ["La Mesa"], submarkets: ["north park"] });
    expect(scoreListing({ zip: "92116-2222" }, b).breakdown[0].status).toBe("pass");
    expect(scoreListing({ city: "la mesa" }, b).breakdown[0].status).toBe("pass");
    expect(scoreListing({ submarket: "North Park" }, b).breakdown[0]).toMatchObject({
      status: "pass",
      message: "Submarket North Park is in your buy box.",
    });
    expect(scoreListing({ zip: "91910", city: "Chula Vista" }, b).breakdown[0]).toMatchObject({
      status: "miss",
      message: "ZIP 91910 · Chula Vista isn't in your buy box locations.",
    });
    expect(scoreListing({}, b).breakdown[0].status).toBe("unknown");
  });

  it("property type miss lists the allowed types", () => {
    const r = scoreListing(
      { property_type: "commercial" },
      box({ propertyTypes: ["duplex", "triplex", "fourplex"] }),
    );
    expect(r.breakdown[0].message).toBe(
      "Commercial isn't one of your property types (Duplex, Triplex, Fourplex).",
    );
  });

  it("formats ranges and messages for min-only and max-only rules", () => {
    const r = scoreListing({ price: 900_000, units: 3 }, box({ priceMin: 1_000_000, unitsMax: 4 }));
    expect(r.breakdown.find((c) => c.key === "price")).toMatchObject({
      target: "≥ $1,000,000",
      message: "Price $900,000, under your $1,000,000 minimum.",
    });
    expect(r.breakdown.find((c) => c.key === "units")).toMatchObject({
      target: "≤ 4",
      message: "3 units, at or under your 4 max.",
    });
  });
});

describe("helpers", () => {
  it("isBuyBoxEmpty", () => {
    expect(isBuyBoxEmpty(null)).toBe(true);
    expect(isBuyBoxEmpty(box())).toBe(true);
    expect(isBuyBoxEmpty(box({ zips: ["92104"] }))).toBe(false);
    expect(isBuyBoxEmpty(box({ yearBuiltMax: 2000 }))).toBe(false);
  });
  it("scoreBand", () => {
    expect(scoreBand(null)).toBe("unscored");
    expect(scoreBand(100)).toBe("high");
    expect(scoreBand(70)).toBe("high");
    expect(scoreBand(69)).toBe("medium");
    expect(scoreBand(40)).toBe("medium");
    expect(scoreBand(39)).toBe("low");
    expect(scoreBand(0)).toBe("low");
  });
  it("buyBoxFromRow maps database rows (numerics as strings)", () => {
    expect(
      buyBoxFromRow({
        zips: ["92104"],
        cities: [],
        submarkets: [],
        property_types: ["duplex"],
        units_min: 2,
        units_max: null,
        price_min: null,
        price_max: "1500000.00",
        max_price_per_unit: "300000.00",
        year_built_min: null,
        year_built_max: null,
        alert_threshold: 80,
        version: 3,
      }),
    ).toMatchObject({
      zips: ["92104"],
      propertyTypes: ["duplex"],
      unitsMin: 2,
      priceMax: 1_500_000,
      maxPricePerUnit: 300_000,
      alertThreshold: 80,
      version: 3,
    });
    expect(buyBoxFromRow(null)).toEqual(EMPTY_BUY_BOX);
    expect(buyBoxFromRow({ version: 0 }).version).toBe(0);
  });
});
