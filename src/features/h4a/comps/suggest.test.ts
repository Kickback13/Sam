import { describe, expect, it } from "vitest";

import { compInputSchema } from "../underwriting/schema";
import {
  fromRecordedSale,
  fromRentCastPull,
  fromSavedComp,
  haversineMiles,
  pacificDate,
  rankCompSuggestions,
  streetKey,
  suggestionToCompInput,
  typesCompatible,
  unitsCompatible,
  type CompSubject,
  type RecordedSaleRow,
  type SavedCompRow,
} from "./suggest";

const NOW = new Date("2026-11-05T18:00:00Z");
const src = (label: string, at = "2026-10-01T17:00:00Z") => ({
  source: "data_api",
  label,
  url: null,
  fetched_at: at,
  user_id: null,
});

const subject: CompSubject = {
  id: "00000000-0000-4000-8000-000000000001",
  address: "3100 Sample Ave",
  city: "San Diego",
  zip: "92104",
  lat: 32.7485,
  lng: -117.13,
  units: 12,
  property_type: "multifamily",
};

const sale = (over: Partial<RecordedSaleRow> = {}): RecordedSaleRow => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  name: null,
  address: "3200 Sample Ave",
  city: "San Diego",
  zip: "92104",
  lat: 32.75,
  lng: -117.128,
  units: 10,
  building_sqft: 8000,
  year_built: 1972,
  property_type: "multifamily",
  last_sale_price: "3000000",
  last_sale_date: "2025-06-01",
  field_sources: { last_sale_price: src("RentCast property record") },
  ...over,
});

const savedComp = (over: Partial<SavedCompRow> = {}): SavedCompRow => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  property_id: "00000000-0000-4000-8000-0000000000b1",
  kind: "sale",
  address: "410 Example Way",
  city: "San Diego",
  zip: "92104",
  units: 14,
  building_sqft: null,
  year_built: null,
  price: 4200000,
  sale_date: "2026-02-01",
  cap_rate: 5.4,
  unit_type: null,
  monthly_rent: null,
  source_label: "Broker OM (Marcus & Co.)",
  source_url: "https://example.com/om.pdf",
  as_of: "2026-03-01",
  notes: null,
  ...over,
});

describe("helpers", () => {
  it("measures distance in miles", () => {
    // ~0.69 mi per 0.01 deg latitude.
    expect(haversineMiles({ lat: 32.7, lng: -117.1 }, { lat: 32.71, lng: -117.1 })).toBeCloseTo(
      0.69,
      1,
    );
  });

  it("matches street lines however they are written", () => {
    expect(streetKey("200 Sample Street, San Diego, CA 92104")).toBe("200 sample st");
    expect(streetKey("200 sample st.")).toBe("200 sample st");
    expect(streetKey("12 North Park Avenue #3")).toBe("12 n park ave 3");
  });

  it("uses the Pacific business day", () => {
    expect(pacificDate("2026-11-05T06:00:00Z")).toBe("2026-11-04");
  });

  it("keeps building types and sizes comparable", () => {
    expect(typesCompatible("multifamily", "fourplex")).toBe(true);
    expect(typesCompatible("multifamily", "land")).toBe(false);
    expect(typesCompatible("multifamily", "commercial")).toBe(false);
    expect(typesCompatible("mixed_use", "commercial")).toBe(true);
    expect(typesCompatible(null, "land")).toBe(true);
    expect(unitsCompatible(3, 4)).toBe(true);
    expect(unitsCompatible(3, 8)).toBe(false);
    expect(unitsCompatible(12, 4)).toBe(false);
    expect(unitsCompatible(12, 48)).toBe(true);
    expect(unitsCompatible(12, 49)).toBe(false);
    expect(unitsCompatible(null, 200)).toBe(true);
  });
});

describe("candidates", () => {
  it("labels a recorded sale with its field's own source and as-of", () => {
    const c = fromRecordedSale(sale())!;
    expect(c.key).toBe(`sale:${sale().id}`);
    expect(c.price).toBe(3_000_000);
    expect(c.source_label).toBe("Last sale on file · RentCast property record");
    expect(c.as_of).toBe("2026-10-01");
  });

  it("never suggests a sale price without a source or a date", () => {
    expect(fromRecordedSale(sale({ field_sources: {} }))).toBeNull();
    expect(fromRecordedSale(sale({ last_sale_date: null }))).toBeNull();
    expect(fromRecordedSale(sale({ last_sale_price: null }))).toBeNull();
  });

  it("keeps a saved comp's source exactly, and drops its old distance", () => {
    const c = fromSavedComp(savedComp());
    expect(c.source_label).toBe("Broker OM (Marcus & Co.)");
    expect(c.source_url).toBe("https://example.com/om.pdf");
    expect(c.as_of).toBe("2026-03-01");
    expect(c.reported_miles).toBeNull();
  });

  it("reads RentCast comparables as listings, never as sales", () => {
    const list = fromRentCastPull({
      id: "00000000-0000-4000-8000-0000000000d1",
      kind: "value",
      fetched_at: "2026-11-01T20:00:00Z",
      comparables: [
        { formattedAddress: "200 Sample St, San Diego, CA 92104", price: 5_900_000, distance: 0.4 },
        { formattedAddress: "No price St" },
        "junk",
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key: "rc:00000000-0000-4000-8000-0000000000d1:0",
      kind: "sale",
      price: 5_900_000,
      sale_date: null,
      reported_miles: 0.4,
      source_label: "RentCast value estimate comparable",
      as_of: "2026-11-01",
    });
    expect(list[0].notes).toContain("list price, not a recorded sale");

    const rent = fromRentCastPull({
      id: "00000000-0000-4000-8000-0000000000d2",
      kind: "rent",
      fetched_at: "2026-11-01T20:00:00Z",
      comparables: [{ formattedAddress: "9 Rent Rd", price: 2100, bedrooms: 2, bathrooms: 1 }],
    });
    expect(rent[0]).toMatchObject({ kind: "rent", monthly_rent: 2100, unit_type: "2BR/1BA" });
    expect(fromRentCastPull({ id: "x", kind: "rent", fetched_at: "", comparables: null })).toEqual(
      [],
    );
  });
});

describe("rankCompSuggestions", () => {
  const rank = (cands: Parameters<typeof rankCompSuggestions>[1], existing = []) =>
    rankCompSuggestions(subject, cands, existing, NOW);

  it("ranks nearer, closer-sized, newer sales first", () => {
    const near = fromRecordedSale(sale())!;
    const far = fromRecordedSale(
      sale({
        id: "00000000-0000-4000-8000-0000000000a2",
        address: "1 Far Rd",
        lat: 32.78,
        lng: -117.13,
        units: 30,
        last_sale_date: "2024-01-01",
      }),
    )!;
    const r = rank([far, near]);
    expect(r.sale.map((s) => s.address)).toEqual(["3200 Sample Ave", "1 Far Rd"]);
    expect(r.sale[0].nearness.type).toBe("miles");
    expect(r.sale[0].distance_miles).toBeLessThan(0.3);
    expect(r.sale[0].price_per_unit).toBe(300_000);
    expect(r.sale[0].score).toBeGreaterThan(r.sale[1].score);
  });

  it("skips the subject, saved comps, old sales, far sales, other sizes and types", () => {
    const r = rank(
      [
        fromRecordedSale(sale({ id: subject.id, address: "3100 Sample Ave" }))!,
        fromRecordedSale(
          sale({
            id: "00000000-0000-4000-8000-0000000000a3",
            address: "1 Old St",
            last_sale_date: "2022-01-01",
          }),
        )!,
        fromRecordedSale(
          sale({ id: "00000000-0000-4000-8000-0000000000a4", address: "1 Far St", lat: 33.0 }),
        )!,
        fromRecordedSale(
          sale({ id: "00000000-0000-4000-8000-0000000000a5", address: "1 Small St", units: 3 }),
        )!,
        fromRecordedSale(
          sale({
            id: "00000000-0000-4000-8000-0000000000a6",
            address: "1 Lot St",
            property_type: "land",
          }),
        )!,
        fromRecordedSale(
          sale({ id: "00000000-0000-4000-8000-0000000000a7", address: "1 Taken St" }),
        )!,
      ],
      [{ kind: "sale", address: "1 Taken Street" }] as never,
    );
    expect(r.sale).toEqual([]);
  });

  it("falls back to ZIP, then city, when coordinates are missing", () => {
    const zip = fromSavedComp(savedComp());
    const city = fromSavedComp(
      savedComp({
        id: "00000000-0000-4000-8000-0000000000c2",
        address: "5 Other Zip",
        zip: "92116",
      }),
    );
    const elsewhere = fromSavedComp(
      savedComp({
        id: "00000000-0000-4000-8000-0000000000c3",
        address: "5 Elsewhere",
        zip: "92008",
        city: "Carlsbad",
      }),
    );
    const r = rank([city, zip, elsewhere]);
    expect(r.sale.map((s) => s.nearness.type)).toEqual(["zip", "city"]);
  });

  it("keeps one suggestion per address: the recorded sale over a copy of it", () => {
    const recorded = fromRecordedSale(sale({ address: "410 Example Way" }))!;
    const copy = fromSavedComp(savedComp());
    const r = rank([copy, recorded]);
    expect(r.sale).toHaveLength(1);
    expect(r.sale[0].origin).toBe("recorded_sale");
  });

  it("produces rows the comp schema accepts, with source and as-of intact", () => {
    const r = rank([
      fromRecordedSale(sale())!,
      ...fromRentCastPull({
        id: "00000000-0000-4000-8000-0000000000d2",
        kind: "rent",
        fetched_at: "2026-11-01T20:00:00Z",
        comparables: [
          { formattedAddress: "9 Rent Rd, San Diego, CA 92104", price: 2100, distance: 0.8 },
        ],
      }),
    ]);
    expect(r.rent).toHaveLength(1);
    for (const s of [...r.sale, ...r.rent]) {
      const parsed = compInputSchema.safeParse(suggestionToCompInput(s));
      expect(parsed.success).toBe(true);
      expect(parsed.data?.source_label).toBe(s.source_label);
      expect(parsed.data?.as_of).toBe(s.as_of);
    }
  });
});
