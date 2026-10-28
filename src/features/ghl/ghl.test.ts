import { describe, expect, it, vi } from "vitest";

import { transformRow } from "@/lib/csv/transform";

import { GHL_API_VERSION, GhlClient, GhlError, ghlBaseUrl, type GhlContact } from "./client";
import {
  defaultStageMap,
  GHL_COLUMN_MAPPING,
  ghlContactToRow,
  planOpportunity,
  smsBlockedPhones,
  type LocalStage,
} from "./map";

const contact = (over: Partial<GhlContact> = {}): GhlContact => ({
  id: "ghl_c1",
  firstName: "Maria",
  lastName: "Lopez",
  email: "Maria@Example.com",
  phone: "+16195550101",
  additionalEmails: ["maria.l@example.com"],
  companyName: "Lopez Framing",
  address1: "1 Main St",
  city: "San Diego",
  state: "CA",
  postalCode: "92104",
  source: "Website form",
  tags: ["homeowner", "adu"],
  dnd: false,
  dndSettings: {},
  ...over,
});

describe("ghlContactToRow → existing CSV import", () => {
  it("maps every field and passes the same validation as a CSV row", () => {
    const row = ghlContactToRow(contact());
    const t = transformRow(row, GHL_COLUMN_MAPPING, { source: "GoHighLevel" });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.ghlContactId).toBe("ghl_c1");
    expect(t.value.contact).toMatchObject({
      first_name: "Maria",
      last_name: "Lopez",
      city: "San Diego",
      zip: "92104",
      source: "Website form",
      tags: expect.arrayContaining(["homeowner", "adu"]),
      dnc: false,
      email_opt_out: false,
    });
    expect(t.value.emailKeys).toEqual(["maria@example.com", "maria.l@example.com"]);
    expect(t.value.phoneKeys).toEqual(["+16195550101"]);
    expect(t.value.companyName).toBe("Lopez Framing");
  });

  it("maps DND to DNC and Email DND to email opt-out; never invents SMS consent", () => {
    const row = ghlContactToRow(
      contact({ dnd: true, dndSettings: { Email: { status: "active" } } }),
    );
    const t = transformRow(row, GHL_COLUMN_MAPPING, {});
    expect(t.ok && t.value.contact).toMatchObject({ dnc: true, email_opt_out: true });
    expect(JSON.stringify(row)).not.toMatch(/consent/i);
  });

  it("falls back to the full name and accepts object-style extra emails", () => {
    const row = ghlContactToRow(
      contact({
        firstName: null,
        lastName: null,
        name: "Sam Example",
        additionalEmails: [{ email: "x@example.com" }],
      }),
    );
    expect(row.Name).toBe("Sam Example");
    expect(row["Additional Emails"]).toBe("x@example.com");
  });

  it("lists the numbers that must not be texted", () => {
    expect(smsBlockedPhones(contact())).toEqual([]);
    expect(smsBlockedPhones(contact({ dndSettings: { SMS: { status: "active" } } }))).toEqual([
      "+16195550101",
    ]);
    expect(smsBlockedPhones(contact({ dnd: true, additionalPhones: ["6195550102"] }))).toEqual([
      "+16195550101",
      "6195550102",
    ]);
    expect(smsBlockedPhones(contact({ dndSettings: { SMS: { status: "inactive" } } }))).toEqual([]);
  });
});

const local: LocalStage[] = [
  {
    id: "s-lead",
    pipelineId: "p1",
    pipelineName: "Projects",
    name: "Lead",
    isWon: false,
    isLost: false,
  },
  {
    id: "s-est",
    pipelineId: "p1",
    pipelineName: "Projects",
    name: "Estimate",
    isWon: false,
    isLost: false,
  },
  {
    id: "s-won",
    pipelineId: "p1",
    pipelineName: "Projects",
    name: "Won",
    isWon: true,
    isLost: false,
  },
  {
    id: "s-lost",
    pipelineId: "p1",
    pipelineName: "Projects",
    name: "Lost",
    isWon: false,
    isLost: true,
  },
  {
    id: "s-other",
    pipelineId: "p2",
    pipelineName: "Other",
    name: "Estimate",
    isWon: false,
    isLost: false,
  },
];
const ghlPipelines = [
  {
    id: "gp",
    name: "Sales",
    stages: [
      { id: "g-new", name: "New Lead" },
      { id: "g-est", name: " estimate " },
    ],
  },
];

describe("opportunities → deals", () => {
  it("defaults to same-name stages in the chosen pipeline, else its first open stage", () => {
    expect(defaultStageMap(ghlPipelines, local, "p1")).toEqual({
      "g-new": "s-lead",
      "g-est": "s-est",
    });
  });

  it("follows the map for open deals and the status for won / lost / abandoned", () => {
    const map = { "g-new": "s-lead", "g-est": "s-est" };
    const base = {
      id: "o1",
      name: "Kitchen remodel",
      monetaryValue: 45000.456,
      pipelineStageId: "g-est",
      contactId: "ghl_c1",
    };
    expect(planOpportunity({ ...base, status: "open" }, map, local)).toMatchObject({
      action: "create",
      stageId: "s-est",
      pipelineId: "p1",
      title: "Kitchen remodel",
      value: 45000.46,
      contactGhlId: "ghl_c1",
      source: "GoHighLevel",
    });
    expect(planOpportunity({ ...base, status: "won" }, map, local)).toMatchObject({
      stageId: "s-won",
    });
    expect(planOpportunity({ ...base, status: "lost" }, map, local)).toMatchObject({
      stageId: "s-lost",
    });
    expect(planOpportunity({ ...base, status: "abandoned" }, map, local)).toMatchObject({
      stageId: "s-lost",
    });
  });

  it("skips unmapped stages and never stores a negative or missing value", () => {
    expect(planOpportunity({ id: "o2", pipelineStageId: "nope" }, {}, local)).toEqual({
      action: "skip",
      reason: "Its GoHighLevel stage isn't mapped",
    });
    expect(
      planOpportunity(
        { id: "o3", pipelineStageId: "g-new", monetaryValue: -5 },
        { "g-new": "s-lead" },
        local,
      ),
    ).toMatchObject({ value: null, title: "GoHighLevel opportunity" });
  });
});

describe("GhlClient", () => {
  const ok = (body: unknown) => vi.fn(async () => Response.json(body));

  it("sends the token, API version and location, and pages with startAfter/startAfterId", async () => {
    const contacts = Array.from({ length: 2 }, (_, i) => ({ id: `c${i}` }));
    const f = ok({ contacts, meta: { total: 3, startAfterId: "c1", startAfter: 1700000000000 } });
    const client = new GhlClient(
      "tok_123",
      "loc_abc",
      f as unknown as typeof fetch,
      "https://ghl.test",
    );
    const page = await client.listContacts(null, 2);
    expect(page).toEqual({
      items: contacts,
      total: 3,
      next: { startAfterId: "c1", startAfter: 1700000000000 },
    });
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://ghl.test/contacts/?locationId=loc_abc&limit=2");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok_123",
      Version: GHL_API_VERSION,
    });

    await client.listContacts(page.next, 2);
    const [url2] = f.mock.calls[1] as unknown as [URL];
    expect(url2.searchParams.get("startAfterId")).toBe("c1");
    expect(url2.searchParams.get("startAfter")).toBe("1700000000000");
  });

  it("stops when a page comes back short", async () => {
    const f = ok({
      contacts: [{ id: "c1" }],
      meta: { total: 1, startAfterId: "c1", startAfter: 1 },
    });
    const page = await new GhlClient(
      "t".repeat(12),
      "loc_abc",
      f as unknown as typeof fetch,
    ).listContacts(null);
    expect(page.next).toBeNull();
  });

  it("reads pipelines with stages in order and opportunities by location_id", async () => {
    const f = vi.fn(async (url: URL) =>
      url.pathname.endsWith("/pipelines")
        ? Response.json({
            pipelines: [
              {
                id: "gp",
                name: "Sales",
                stages: [
                  { id: "b", name: "B", position: 2 },
                  { id: "a", name: "A", position: 1 },
                ],
              },
            ],
          })
        : Response.json({ opportunities: [{ id: "o1" }], meta: { total: 1 } }),
    );
    const client = new GhlClient(
      "tok_123",
      "loc_abc",
      f as unknown as typeof fetch,
      "https://ghl.test",
    );
    expect((await client.getPipelines())[0].stages.map((s) => s.id)).toEqual(["a", "b"]);
    const opps = await client.searchOpportunities(null);
    expect(opps.items).toEqual([{ id: "o1" }]);
    expect((f.mock.calls[1] as unknown as [URL])[0].searchParams.get("location_id")).toBe(
      "loc_abc",
    );
  });

  it.each([
    [401, "auth"],
    [403, "scope"],
    [404, "not_found"],
    [429, "rate_limit"],
    [500, "server"],
  ])("HTTP %i → %s error", async (status, kind) => {
    const f = vi.fn(async () => new Response("x", { status, headers: { "retry-after": "7" } }));
    const err = await new GhlClient("tok_123", "loc_abc", f as unknown as typeof fetch)
      .getPipelines()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhlError);
    expect((err as GhlError).kind).toBe(kind);
    if (kind === "rate_limit") expect((err as GhlError).retryAfterSeconds).toBe(7);
  });

  it("only honours the test base URL outside Vercel", () => {
    expect(ghlBaseUrl({ GHL_API_BASE: "http://127.0.0.1:3199/" })).toBe("http://127.0.0.1:3199");
    expect(ghlBaseUrl({ GHL_API_BASE: "http://evil", VERCEL_ENV: "production" })).toBe(
      "https://services.leadconnectorhq.com",
    );
    expect(ghlBaseUrl({})).toBe("https://services.leadconnectorhq.com");
  });
});
