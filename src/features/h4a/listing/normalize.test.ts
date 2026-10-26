import { describe, expect, it } from "vitest";

import {
  formatApn,
  listingKeys,
  normalizeApn,
  normalizeCity,
  normalizeStreet,
  splitAddressLine,
  zip5,
} from "./normalize";

describe("normalizeStreet", () => {
  it.each([
    ["3100 Sample Ave", "3100 sample ave"],
    ["3100 Sample Avenue", "3100 sample ave"],
    ["3100  SAMPLE   AVE.", "3100 sample ave"],
    ["3100 Sample Ave, Unit 4", "3100 sample ave"],
    ["3100 Sample Ave #4", "3100 sample ave"],
    ["3100 Sample Ave Apt. 12B", "3100 sample ave"],
    ["3100 Sample Ave Suite 200", "3100 sample ave"],
    ["1200 North Example Boulevard", "1200 n example blvd"],
    ["1200 N. Example Blvd", "1200 n example blvd"],
    ["3100 - 3110 Sample Street", "3100-3110 sample st"],
    ["15010 Demo Creek Road", "15010 demo creek rd"],
    ["845 Sample Commons", "845 sample commons"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeStreet(input)).toBe(expected);
  });

  it("returns null for blanks and non-strings", () => {
    expect(normalizeStreet("   ")).toBeNull();
    expect(normalizeStreet(null)).toBeNull();
    expect(normalizeStreet(42)).toBeNull();
  });
});

describe("city, ZIP and APN", () => {
  it("normalizes cities", () => {
    expect(normalizeCity("  San  Diego ")).toBe("san diego");
    expect(normalizeCity("La Mesa,")).toBe("la mesa");
    expect(normalizeCity("")).toBeNull();
  });
  it("takes the first five ZIP digits", () => {
    expect(zip5("92104")).toBe("92104");
    expect(zip5("92104-1234")).toBe("92104");
    expect(zip5("921041234")).toBe("92104");
    expect(zip5("9210")).toBeNull();
    expect(zip5(null)).toBeNull();
  });
  it("keeps APN digits only, 6–20 of them", () => {
    expect(normalizeApn("123-456-78-90")).toBe("1234567890");
    expect(normalizeApn("APN 123 456 78 90")).toBe("1234567890");
    expect(normalizeApn("12-34")).toBeNull();
    expect(formatApn("1234567890")).toBe("123-456-78-90");
    expect(formatApn("12-345")).toBe("12-345");
  });
});

describe("listingKeys", () => {
  it("builds APN + ZIP + city keys", () => {
    expect(
      listingKeys({
        address: "3100 Sample Avenue",
        city: "San Diego",
        zip: "92104",
        apn: "123-456-78-90",
      }),
    ).toEqual({
      streetKey: "3100 sample ave",
      apnKey: "1234567890",
      matchKeys: ["apn:1234567890", "addr:3100 sample ave|92104", "addr:3100 sample ave|san diego"],
    });
  });
  it("falls back to a bare street key when there's no city or ZIP", () => {
    expect(listingKeys({ address: "3100 Sample Ave" }).matchKeys).toEqual([
      "addr:3100 sample ave|",
    ]);
  });
  it("has no keys without an address or APN", () => {
    expect(listingKeys({ city: "San Diego" })).toEqual({
      streetKey: null,
      apnKey: null,
      matchKeys: [],
    });
  });
});

describe("splitAddressLine", () => {
  it("splits street, city, state and ZIP", () => {
    expect(splitAddressLine("3100 Sample Ave, San Diego, CA 92104")).toEqual({
      address: "3100 Sample Ave",
      city: "San Diego",
      state: "CA",
      zip: "92104",
    });
  });
  it("handles missing parts", () => {
    expect(splitAddressLine("3100 Sample Ave")).toEqual({
      address: "3100 Sample Ave",
      city: null,
      state: null,
      zip: null,
    });
    expect(splitAddressLine("3100 Sample Ave, La Mesa 91942")).toMatchObject({
      address: "3100 Sample Ave",
      city: "La Mesa",
      zip: "91942",
    });
  });
});
