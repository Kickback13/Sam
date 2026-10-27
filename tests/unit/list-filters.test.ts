import { describe, expect, it } from "vitest";

import { filterHref, filtersKey, mergeFilters } from "@/lib/list-filters";

describe("list filters", () => {
  it("two quick changes keep both (each builds on the last requested state)", () => {
    const loaded = { status: "open" };
    const first = mergeFilters(loaded, { band: "high" });
    const second = mergeFilters(first, { origin: "csv" });
    expect(second).toEqual({ status: "open", band: "high", origin: "csv" });
  });

  it("changing a filter resets the page and drops cleared values", () => {
    expect(mergeFilters({ page: "3", zip: "92104" }, { zip: undefined, band: "low" })).toEqual({
      band: "low",
    });
  });

  it("builds the URL and compares sets regardless of order", () => {
    expect(filterHref("/w/x/deal-finder", { band: "high", q: "elm st" })).toBe(
      "/w/x/deal-finder?band=high&q=elm+st",
    );
    expect(filterHref("/w/x/deal-finder", {})).toBe("/w/x/deal-finder");
    expect(filtersKey({ a: "1", b: "2", c: undefined })).toBe(filtersKey({ b: "2", a: "1" }));
  });
});
