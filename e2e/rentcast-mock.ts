import { createServer, type Server } from "node:http";

/**
 * Local stand-in for RentCast (the three read endpoints the app uses). The app is pointed
 * here through RENTCAST_API_BASE in playwright.config.ts, so tests never call RentCast.
 */
export const RENTCAST_MOCK_PORT = Number(process.env.E2E_RENTCAST_MOCK_PORT ?? 3198);
export const RENTCAST_KEY = "rc-e2e-key-0123456789abcdef";

export const MOCK_RECORD = {
  id: "100-Rentcast-Way,-San-Diego,-CA-92104",
  formattedAddress: "100 Rentcast Way, San Diego, CA 92104",
  zipCode: "92104",
  county: "San Diego",
  assessorID: "453-000-11-00",
  propertyType: "Apartment",
  yearBuilt: 1985,
  squareFootage: 18400,
  lastSaleDate: "2004-06-15T00:00:00.000Z",
  lastSalePrice: 1950000,
  ownerOccupied: false,
  features: { unitCount: 24 },
  taxAssessments: { "2024": { year: 2024, value: 2450000 } },
  propertyTaxes: { "2024": { year: 2024, total: 29600 } },
  owner: {
    names: ["Example Family Trust"],
    mailingAddress: { formattedAddress: "PO Box 100, La Jolla, CA 92037" },
  },
  history: { "2004-06-15": { event: "Sale", date: "2004-06-15T00:00:00.000Z", price: 1950000 } },
};

export type RentCastMock = {
  server: Server;
  requests: { path: string; key: string | undefined }[];
};

export function startRentCastMock(): Promise<RentCastMock> {
  const requests: RentCastMock["requests"] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${RENTCAST_MOCK_PORT}`);
    const key = req.headers["x-api-key"] as string | undefined;
    requests.push({ path: url.pathname, key });
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (key !== RENTCAST_KEY) return json(401, { message: "Invalid API key" });
    if (url.pathname === "/v1/properties") {
      if (!(url.searchParams.get("address") ?? "").includes("100 Rentcast Way"))
        return json(404, { message: "No results" });
      return json(200, [MOCK_RECORD]);
    }
    if (url.pathname === "/v1/avm/value")
      return json(200, {
        price: 6100000,
        priceRangeLow: 5600000,
        priceRangeHigh: 6600000,
        comparables: [
          { formattedAddress: "200 Sample St, San Diego, CA 92104", price: 5900000, distance: 0.4 },
        ],
      });
    if (url.pathname === "/v1/avm/rent/long-term")
      return json(200, { rent: 2150, rentRangeLow: 1900, rentRangeHigh: 2400, comparables: [] });
    return json(404, { message: "Not found" });
  });
  return new Promise((resolve) =>
    server.listen(RENTCAST_MOCK_PORT, "127.0.0.1", () => resolve({ server, requests })),
  );
}
