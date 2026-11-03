import { describe, expect, it } from "vitest";

import { brokerKey, heldSinceCutoff, rankBrokers, yearsHeld, type BrokerListing } from "./rank";

let n = 0;
const listing = (over: Partial<BrokerListing>): BrokerListing => ({
  id: `l${++n}`,
  broker_name: null,
  broker_company: null,
  broker_email: null,
  broker_phone: null,
  units: null,
  price: null,
  score: null,
  status: "new",
  deal_id: null,
  received_at: "2026-10-01T00:00:00Z",
  zip: null,
  ...over,
});

describe("brokerKey", () => {
  it("prefers email, then phone, then name + company; none without details", () => {
    expect(
      brokerKey(listing({ broker_email: " Ana@Example.TEST ", broker_phone: "6195550100" })),
    ).toBe("e:ana@example.test");
    expect(brokerKey(listing({ broker_phone: "(619) 555-0100", broker_name: "Ana" }))).toBe(
      "p:+16195550100",
    );
    expect(
      brokerKey(listing({ broker_name: " Ana  Ruiz ", broker_company: "Example Realty" })),
    ).toBe("n:ana ruiz|example realty");
    expect(brokerKey(listing({ broker_company: "Example Realty" }))).toBeNull();
  });
});

describe("rankBrokers", () => {
  const rows = [
    listing({
      broker_name: "Ana Ruiz",
      broker_email: "ana@example.test",
      units: 12,
      price: "2400000",
      score: 82,
      deal_id: "d1",
      zip: "92104",
      received_at: "2026-10-01T00:00:00Z",
    }),
    listing({
      broker_name: "Ana Ruiz",
      broker_email: "ANA@example.test",
      broker_phone: "6195550100",
      units: 30,
      price: 6_000_000,
      score: 55,
      zip: "92104",
      received_at: "2026-10-20T00:00:00Z",
    }),
    listing({
      broker_name: "Ben Lee",
      broker_company: "Sample CRE",
      units: 8,
      score: 90,
      deal_id: "d2",
      zip: "92116",
      received_at: "2026-10-25T00:00:00Z",
    }),
    listing({ broker_company: "No name or contact" }),
  ];
  const deals = new Map([
    ["d1", "won"],
    ["d2", "open"],
  ]);

  it("groups a broker's listings and totals them", () => {
    const [ana, ben] = rankBrokers(rows, deals);
    expect(ana).toMatchObject({
      name: "Ana Ruiz",
      email: "ANA@example.test",
      phone: "6195550100", // latest non-empty details win
      listings: 2,
      units: 42,
      volume: 8_400_000,
      matches: 1,
      promoted: 1,
      closed: 1,
      lastListedAt: "2026-10-20T00:00:00Z",
      topZips: ["92104"],
    });
    expect(ben).toMatchObject({ listings: 1, matches: 1, promoted: 1, closed: 0 });
    expect(rankBrokers(rows, deals)).toHaveLength(2); // the detail-less listing is skipped
  });

  it("sorts by the chosen measure", () => {
    expect(rankBrokers(rows, deals, "recent").map((b) => b.name)).toEqual(["Ben Lee", "Ana Ruiz"]);
    expect(rankBrokers(rows, deals, "closed").map((b) => b.name)).toEqual(["Ana Ruiz", "Ben Lee"]);
    expect(rankBrokers(rows, deals, "volume")[0].name).toBe("Ana Ruiz");
  });
});

describe("long-hold owners", () => {
  const today = new Date("2026-11-03T12:00:00Z");
  it("counts whole years held, respecting the anniversary", () => {
    expect(yearsHeld("2011-11-03", today)).toBe(15);
    expect(yearsHeld("2011-11-04", today)).toBe(14);
    expect(yearsHeld("1998-06-30", today)).toBe(28);
    expect(yearsHeld("2030-01-01", today)).toBe(0);
  });
  it("gives the sale-date cutoff for the database filter", () => {
    expect(heldSinceCutoff(15, today)).toBe("2011-11-03");
    expect(yearsHeld(heldSinceCutoff(15, today), today)).toBe(15);
  });
});
