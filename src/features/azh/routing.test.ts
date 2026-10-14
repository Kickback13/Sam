import { describe, expect, it } from "vitest";

import { normalizeZip, parseZipList, routeOffice } from "./routing";

describe("ZIP → office routing", () => {
  const routes = new Map([
    ["92028", "fallbrook" as const],
    ["92003", "fallbrook" as const],
  ]);

  it("routes listed North County ZIPs to Fallbrook", () => {
    expect(routeOffice("92028", routes)).toBe("fallbrook");
    expect(routeOffice("92003-1234", routes)).toBe("fallbrook");
    expect(routeOffice(" 92028 ", { "92028": "fallbrook" })).toBe("fallbrook");
  });

  it("routes everything else to San Diego", () => {
    expect(routeOffice("92104", routes)).toBe("san_diego");
    expect(routeOffice("", routes)).toBe("san_diego");
    expect(routeOffice(null, routes)).toBe("san_diego");
    expect(routeOffice("abc", routes)).toBe("san_diego");
  });

  it("normalizes ZIPs", () => {
    expect(normalizeZip("92028-0001")).toBe("92028");
    expect(normalizeZip("920")).toBeNull();
  });

  it("parses pasted ZIP lists", () => {
    expect(parseZipList("92028, 92003\n92028; 9200x 920591")).toEqual({
      zips: ["92003", "92028"],
      invalid: ["9200x", "920591"],
    });
  });
});
