import { describe, expect, it } from "vitest";

import type { FieldSource } from "@/lib/field-sources";

import { EMPTY_INPUTS } from "./math";
import { prefillInputs, stampInputSources } from "./prefill";
import { compInputSchema, parseStoredInputs, underwritingInputsSchema } from "./schema";

const src = (label: string): FieldSource => ({
  source: "email",
  label,
  url: null,
  fetched_at: "2026-10-24T17:00:00.000Z",
});

describe("prefillInputs", () => {
  it("copies price from the listing and units/sq ft from the property, with sources", () => {
    const { inputs, sources } = prefillInputs(
      { units: 8, building_sqft: 6400, field_sources: { units: src("Entered by Sam") } },
      {
        price: 2_000_000,
        units: 9,
        building_sqft: null,
        field_sources: { price: src("Listing email 10/24"), units: src("Listing email 10/24") },
      },
    );
    expect(inputs.price).toBe(2_000_000);
    expect(sources.price?.label).toBe("Listing email 10/24");
    expect(inputs.units).toBe(8);
    expect(sources.units?.label).toBe("Entered by Sam");
    expect(inputs.buildingSqft).toBe(6400);
    expect(sources.buildingSqft).toBeUndefined();
  });

  it("never invents rents, vacancy, expenses or a loan", () => {
    const { inputs } = prefillInputs(
      { units: 8, building_sqft: null, field_sources: {} },
      { price: 1_000_000, units: null, building_sqft: null, field_sources: {} },
    );
    expect({ ...inputs, price: null, units: null }).toEqual(EMPTY_INPUTS);
  });

  it("without a listing there's no price (the last sale price is not an asking price)", () => {
    const { inputs } = prefillInputs({ units: 4, building_sqft: null, field_sources: {} }, null);
    expect(inputs.price).toBeNull();
    expect(inputs.units).toBe(4);
  });
});

describe("stampInputSources", () => {
  const user = { id: "u1", name: "Sam Rodriguez" };
  const now = new Date("2026-10-27T08:00:00.000Z");

  it("keeps unchanged sources, stamps edits, drops cleared inputs", () => {
    const before = { ...EMPTY_INPUTS, price: 2_000_000, units: 8 };
    const after = { ...EMPTY_INPUTS, price: 1_900_000, vacancyPct: 5 };
    const out = stampInputSources(
      { price: src("Listing"), units: src("Property") },
      before,
      after,
      user,
      now,
    );
    expect(out.price?.label).toBe("Entered by Sam Rodriguez");
    expect(out.price?.user_id).toBe("u1");
    expect(out.vacancyPct?.label).toBe("Entered by Sam Rodriguez");
    expect(out.units).toBeUndefined();
  });

  it("an unchanged value keeps its listing source", () => {
    const i = { ...EMPTY_INPUTS, price: 2_000_000 };
    expect(stampInputSources({ price: src("Listing") }, i, i, user, now).price?.label).toBe(
      "Listing",
    );
  });
});

describe("schemas", () => {
  it("parses form strings into numbers and blanks into null", () => {
    const r = underwritingInputsSchema.parse({ price: "$2,000,000", vacancyPct: "", unitMix: [] });
    expect(r.price).toBe(2_000_000);
    expect(r.vacancyPct).toBeNull();
    expect(r.expenseMode).toBe("itemized");
  });

  it("rejects out-of-range values", () => {
    expect(underwritingInputsSchema.safeParse({ vacancyPct: 120 }).success).toBe(false);
    expect(underwritingInputsSchema.safeParse({ taxRatePct: 15 }).success).toBe(false);
  });

  it("unreadable stored inputs fall back to empty, never invented", () => {
    expect(parseStoredInputs({ price: "lots" })).toEqual(EMPTY_INPUTS);
    expect(parseStoredInputs(null)).toEqual(EMPTY_INPUTS);
  });

  it("comps need a source, a date, and a price (sale) or rent (rent)", () => {
    const base = { address: "1 A St", source_label: "OM", as_of: "2026-10-01" };
    expect(compInputSchema.safeParse({ ...base, kind: "sale" }).success).toBe(false);
    expect(compInputSchema.safeParse({ ...base, kind: "sale", price: "900000" }).success).toBe(
      true,
    );
    expect(compInputSchema.safeParse({ ...base, kind: "rent", monthly_rent: "2400" }).success).toBe(
      true,
    );
    expect(
      compInputSchema.safeParse({ ...base, kind: "rent", monthly_rent: "2400", source_label: "" })
        .success,
    ).toBe(false);
  });
});
