import { describe, expect, it } from "vitest";

import { rankPropertyManagers, type PmContact, type PmDeals } from "./rank";

const companies = [
  { id: "co1", name: "Bayview PM", phone: "(619) 555-0100", email: null, city: "San Diego" },
  { id: "co2", name: "Alpine Management", phone: null, email: "hi@alpine.test", city: null },
];
const contacts: PmContact[] = [
  { id: "a", name: "Ann", companyId: "co1", phone: null, email: "ann@bay.test" },
  { id: "b", name: "Ben", companyId: "co1", phone: null, email: null },
  { id: "c", name: "Cy Solo", companyId: null, phone: "(858) 555-0101", email: null },
  { id: "d", name: "Di", companyId: "other-co", phone: null, email: null },
];
const deals = new Map<string, PmDeals>([
  ["a", { open: 1, won: 1, total: 2 }],
  ["b", { open: 1, won: 0, total: 1 }],
  ["c", { open: 0, won: 0, total: 1 }],
]);
const last = new Map([
  ["a", "2026-10-01T00:00:00Z"],
  ["b", "2026-11-01T00:00:00Z"],
  ["c", "2026-06-01T00:00:00Z"],
]);
const touches = new Map([
  ["a", 2],
  ["b", 3],
]);

describe("property managers", () => {
  it("groups people under their company and keeps independents as their own row", () => {
    const rows = rankPropertyManagers(companies, contacts, deals, last, touches, "deals");
    expect(rows.map((r) => r.name)).toEqual(["Bayview PM", "Cy Solo", "Alpine Management", "Di"]);
    const bay = rows[0];
    expect(bay.people.map((p) => p.name)).toEqual(["Ann", "Ben"]);
    expect(bay.deals).toEqual({ open: 2, won: 1, total: 3 });
    expect(bay.lastContactAt).toBe("2026-11-01T00:00:00Z");
    expect(bay.touches90).toBe(5);
    expect(bay.email).toBe("ann@bay.test");
    expect(rows.find((r) => r.name === "Alpine Management")?.people).toEqual([]);
  });

  it("follow-up order: never contacted first, then longest since", () => {
    const rows = rankPropertyManagers(companies, contacts, deals, last, touches, "stale");
    expect(rows.map((r) => r.name)).toEqual(["Alpine Management", "Di", "Cy Solo", "Bayview PM"]);
    expect(rankPropertyManagers(companies, contacts, deals, last, touches, "recent")[0].name).toBe(
      "Bayview PM",
    );
  });
});
