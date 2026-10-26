import { describe, expect, it } from "vitest";

import { isSameListing, planListingRows } from "./dedupe";
import { listingKeys } from "./normalize";

const keyed = (a: Parameters<typeof listingKeys>[0]) => {
  const k = listingKeys(a);
  return { apnKey: k.apnKey, matchKeys: k.matchKeys };
};

describe("isSameListing", () => {
  it("matches the same building written differently", () => {
    expect(
      isSameListing(
        keyed({ address: "3100 Sample Ave", city: "San Diego", zip: "92104" }),
        keyed({ address: "3100 Sample Avenue, Unit 2", zip: "92104-0001" }),
      ),
    ).toBe(true);
  });
  it("matches on city when one side has no ZIP", () => {
    expect(
      isSameListing(
        keyed({ address: "3100 Sample Ave", city: "San Diego", zip: "92104" }),
        keyed({ address: "3100 Sample Ave", city: "san diego" }),
      ),
    ).toBe(true);
  });
  it("keeps the same street in different cities apart", () => {
    expect(
      isSameListing(
        keyed({ address: "100 Main St", city: "La Mesa", zip: "91942" }),
        keyed({ address: "100 Main St", city: "El Cajon", zip: "92020" }),
      ),
    ).toBe(false);
  });
  it("matches on APN even when the address text differs", () => {
    expect(
      isSameListing(
        keyed({ address: "3100-3110 Sample Ave", apn: "123-456-78-90" }),
        keyed({ address: "3104 Sample Ave", apn: "1234567890" }),
      ),
    ).toBe(true);
  });
  it("never matches two different APNs", () => {
    expect(
      isSameListing(
        keyed({ address: "3100 Sample Ave", zip: "92104", apn: "123-456-78-90" }),
        keyed({ address: "3100 Sample Ave", zip: "92104", apn: "123-456-78-91" }),
      ),
    ).toBe(false);
  });
});

describe("planListingRows", () => {
  it("plans updates, in-file duplicates and creates in order", () => {
    const existing = [
      {
        id: "L1",
        address: "3100 Sample Ave",
        ...keyed({ address: "3100 Sample Ave", zip: "92104" }),
      },
    ];
    const rows = [
      { row: 2, ...keyed({ address: "3100 Sample Avenue", zip: "92104" }) },
      { row: 3, ...keyed({ address: "4415 Example St", city: "San Diego" }) },
      { row: 4, ...keyed({ address: "4415 Example Street", city: "San Diego" }) },
      { row: 5, ...keyed({ address: "1 New Way", zip: "92020" }) },
    ];
    const plans = planListingRows(rows, existing);
    expect(plans.get(2)).toEqual({
      action: "update",
      existingId: "L1",
      existingAddress: "3100 Sample Ave",
    });
    expect(plans.get(3)).toEqual({ action: "create" });
    expect(plans.get(4)).toEqual({ action: "duplicate_in_file", firstRow: 3 });
    expect(plans.get(5)).toEqual({ action: "create" });
  });
  it("prefers an APN match over an address match", () => {
    const existing = [
      { id: "byAddr", address: "9 A St", ...keyed({ address: "9 A St", zip: "92104" }) },
      {
        id: "byApn",
        address: "11 A St",
        ...keyed({ address: "11 A St", zip: "92104", apn: "1234567890" }),
      },
    ];
    const plans = planListingRows(
      [{ row: 2, ...keyed({ address: "9 A St", zip: "92104", apn: "1234567890" }) }],
      existing,
    );
    expect(plans.get(2)).toMatchObject({ action: "update", existingId: "byApn" });
  });
});
