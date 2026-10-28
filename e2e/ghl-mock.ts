import { createServer, type Server } from "node:http";

/**
 * Local stand-in for the GoHighLevel API (only the three read endpoints the
 * import uses), shaped like GHL's official SDK models. The app is pointed here
 * through GHL_API_BASE in playwright.config.ts.
 */
export const GHL_MOCK_PORT = Number(process.env.E2E_GHL_MOCK_PORT ?? 3199);
export const GHL_TOKEN = "pit-e2e-token-0123456789";
export const GHL_LOCATION = "locE2E12345";

type Contact = Record<string, unknown> & { id: string };

/** 101 contacts → two pages of 100. Special cases first. */
export function mockContacts(): Contact[] {
  const special: Contact[] = [
    {
      id: "ghl_merge",
      firstName: "Existing",
      lastName: "Person",
      email: "existing.person@example.test",
      phone: "+16195550301",
      tags: ["vip"],
      source: "Referral",
    },
    { id: "ghl_dnd", firstName: "Dee", lastName: "Dnd", email: "dee@example.test", dnd: true },
    {
      id: "ghl_smsdnd",
      firstName: "Sam",
      lastName: "Smsoff",
      email: "smsoff@example.test",
      phone: "+16195550302",
      dndSettings: { SMS: { status: "active" } },
    },
    {
      id: "ghl_emaildnd",
      firstName: "Em",
      lastName: "Unsub",
      email: "unsub@example.test",
      dndSettings: { Email: { status: "active" } },
    },
  ];
  const bulk = Array.from({ length: 101 - special.length }, (_, i) => ({
    id: `ghl_bulk_${i}`,
    firstName: "Bulk",
    lastName: `Contact${i}`,
    email: `bulk${i}@example.test`,
  }));
  return [...special, ...bulk];
}

const pipelines = [
  {
    id: "gp_sales",
    name: "Sales",
    stages: [
      { id: "gs_new", name: "New Lead", position: 0 },
      { id: "gs_est", name: "Estimate", position: 1 },
      { id: "gs_hold", name: "On Hold", position: 2 },
    ],
  },
];

const opportunities = [
  {
    id: "go_1",
    name: "Kitchen remodel",
    monetaryValue: 45000,
    pipelineId: "gp_sales",
    pipelineStageId: "gs_est",
    status: "open",
    contactId: "ghl_merge",
  },
  {
    id: "go_2",
    name: "ADU build",
    monetaryValue: 180000,
    pipelineId: "gp_sales",
    pipelineStageId: "gs_new",
    status: "won",
    contactId: "ghl_dnd",
  },
  {
    id: "go_3",
    name: "Paused job",
    monetaryValue: 1000,
    pipelineId: "gp_sales",
    pipelineStageId: "gs_hold",
    status: "open",
  },
];

export function startGhlMock(): Promise<Server> {
  const contacts = mockContacts();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${GHL_MOCK_PORT}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${GHL_TOKEN}`)
      return json(401, { message: "Invalid JWT" });
    if (!req.headers.version) return json(400, { message: "Version header missing" });

    if (url.pathname === "/contacts/") {
      if (url.searchParams.get("locationId") !== GHL_LOCATION)
        return json(403, { message: "Forbidden" });
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const after = url.searchParams.get("startAfterId");
      const start = after ? contacts.findIndex((c) => c.id === after) + 1 : 0;
      const page = contacts.slice(start, start + limit);
      const last = page[page.length - 1];
      return json(200, {
        contacts: page,
        meta: {
          total: contacts.length,
          startAfterId: last?.id ?? null,
          startAfter: last ? start + page.length : null,
        },
      });
    }
    if (url.pathname === "/opportunities/pipelines") return json(200, { pipelines });
    if (url.pathname === "/opportunities/search")
      return json(200, { opportunities, meta: { total: opportunities.length } });
    return json(404, { message: "Not found" });
  });
  return new Promise((resolve) => server.listen(GHL_MOCK_PORT, "127.0.0.1", () => resolve(server)));
}
