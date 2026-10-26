import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { LOOPNET_DIGEST } from "@/features/h4a/email/fixtures/placeholder-emails";
import { sign } from "@/features/h4a/inbound/signature";

import { API_URL, assertSafeTarget, db, PUBLISHABLE_KEY } from "./env";

// The webhook modules are server-only; this test runs them directly in Node.
vi.mock("server-only", () => ({}));

/**
 * End to end through POST /api/inbound/email's handler against the LOCAL
 * stack: signed Resend webhook → recipient token → idempotent receive →
 * inline job (Inngest not configured) → body from the (stubbed) Resend API →
 * parse → dedupe → score → alert. Only Resend's HTTP API is stubbed.
 */
const SLUG = "h4a-vitest-inbound";
const TOKEN = "vitestvitestvitestvi";
const DOMAIN = "in.example.test";
const SECRET = `whsec_${Buffer.from("h4a-inbound-test-secret-local-only").toString("base64")}`;
const ADDRESS = `deals.${TOKEN}@${DOMAIN}`;

let handle: (r: Request) => Promise<Response>;
const realFetch = globalThis.fetch;
const env = { ...process.env };

function event(emailId: string, to = [ADDRESS], type = "email.received") {
  return JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      created_at: new Date().toISOString(),
      from: "Sam Placeholder <sam.placeholder@example.com>",
      to,
      cc: [],
      bcc: [],
      received_for: to,
      message_id: `<${emailId}@example.test>`,
      subject: "Fwd: placeholder LoopNet digest",
      attachments: [],
    },
  });
}

function signed(body: string, secret = SECRET) {
  const id = `msg_${randomUUID()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost/api/inbound/email", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": `v1,${sign(secret, id, ts, body)}`,
    },
  });
}

async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const c = await db();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  assertSafeTarget();
  await q("delete from public.workspaces where slug = $1", [SLUG]);
  const [ws] = await q<{ id: string }>(
    "insert into public.workspaces (name, slug, business_type, is_demo) values ('H4A inbound test', $1, 'real_estate', true) returning id",
    [SLUG],
  );
  await q(
    "insert into public.h4a_buy_boxes (workspace_id, zips, max_price_per_unit, alert_threshold) values ($1, '{92104,92116}', 210000, 70)",
    [ws.id],
  );
  await q(
    "insert into public.h4a_inbound_addresses (workspace_id, token_hash, token_hint) values ($1, $2, 'stvi')",
    [ws.id, createHash("sha256").update(TOKEN).digest("hex")],
  );

  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    RESEND_WEBHOOK_SECRET: SECRET,
    INBOUND_EMAIL_DOMAIN: DOMAIN,
    RESEND_API_KEY: "re_local_test_only",
  });
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_DEV;
  delete process.env.VERCEL_ENV;
  delete process.env.H4A_ALERT_EMAILS;

  // Stub only Resend's Receiving API; everything else (Supabase) goes through.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.resend.com/emails/receiving/")) {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_local_test_only");
      const id = decodeURIComponent(url.split("/").pop()!.split("?")[0]);
      return new Response(
        JSON.stringify({
          id,
          from: LOOPNET_DIGEST.from,
          subject: LOOPNET_DIGEST.subject,
          text: LOOPNET_DIGEST.text,
          html: null,
        }),
        { status: 200 },
      );
    }
    return realFetch(input, init);
  });
  ({ handleInboundEmailWebhook: handle } = await import("@/features/h4a/server/inbound-webhook"));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env = env;
  await q("delete from public.workspaces where slug = $1", [SLUG]);
});

describe("POST /api/inbound/email (local stack)", () => {
  const emailId = `vitest-${randomUUID()}`;

  it("turns a signed forwarded alert into scored, deduped listings and an alert", async () => {
    const res = await handle(signed(event(emailId)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: "inline" });

    const [email] = await q<{
      parse_status: string;
      listing_count: number;
      parser_key: string;
      text_body: string;
    }>(
      "select e.parse_status, e.listing_count, e.parser_key, e.text_body from public.h4a_inbound_emails e join public.workspaces w on w.id = e.workspace_id where w.slug = $1 and e.provider_email_id = $2",
      [SLUG, emailId],
    );
    expect(email).toMatchObject({
      parse_status: "parsed",
      listing_count: 2,
      parser_key: "loopnet-saved-search",
    });
    expect(email.text_body).toContain("PLACEHOLDER SAMPLE");

    const listings = await q<{
      address: string;
      score: number;
      status: string;
      label: string;
      source: string;
    }>(
      `select l.address, l.score, l.status, l.field_sources->'price'->>'label' as label, l.field_sources->'price'->>'source' as source
       from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id where w.slug = $1 order by l.address`,
      [SLUG],
    );
    expect(listings).toEqual([
      {
        address: "3100 Sample Ave",
        score: 100,
        status: "new",
        label: "LoopNet alert",
        source: "email",
      },
      // $220,000/unit is over the $210,000 max → 25 of 45 points.
      {
        address: "4415 Example St",
        score: 56,
        status: "new",
        label: "LoopNet alert",
        source: "email",
      },
    ]);
    const alerts = await q<{ address: string; score: number; email_status: string }>(
      `select l.address, a.score, a.email_status from public.h4a_alerts a join public.h4a_listings l on l.id = a.listing_id
       join public.workspaces w on w.id = a.workspace_id where w.slug = $1`,
      [SLUG],
    );
    expect(alerts).toEqual([
      { address: "3100 Sample Ave", score: 100, email_status: "not_connected" },
    ]);
  });

  it("is idempotent when Resend retries the same email", async () => {
    const res = await handle(signed(event(emailId)));
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
    const [{ n }] = await q<{ n: string }>(
      "select count(*) as n from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id where w.slug = $1",
      [SLUG],
    );
    expect(Number(n)).toBe(2);
  });

  it("dedupes a second email about the same building and records the change", async () => {
    const second = `vitest-${randomUUID()}`;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.resend.com/emails/receiving/"))
        return new Response(
          JSON.stringify({
            id: second,
            from: "LoopNet (placeholder) <alerts@loopnet.example>",
            subject: "Price reduced",
            text: "1. Sample Ave Apartments\n3100 Sample Avenue, San Diego, CA 92104\nMultifamily | 24 Units | Built 1964\nPrice: $4,800,000\n",
            html: null,
          }),
          { status: 200 },
        );
      return realFetch(input, init);
    });
    const res = await handle(signed(event(second)));
    expect(res.status).toBe(200);
    const rows = await q<{ price: string; n: string }>(
      `select max(l.price)::text as price, count(*) as n from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id
       where w.slug = $1 and l.street_key = '3100 sample ave'`,
      [SLUG],
    );
    expect(rows[0]).toEqual({ price: "4800000.00", n: "1" });
    const [{ n: events }] = await q<{ n: string }>(
      `select count(*) as n from public.h4a_listing_events e join public.workspaces w on w.id = e.workspace_id
       where w.slug = $1 and e.kind = 'updated' and e.changes->'changed' ? 'price'`,
      [SLUG],
    );
    expect(Number(events)).toBe(1);
  });

  it("rejects unsigned or wrongly signed requests", async () => {
    const body = event(`vitest-${randomUUID()}`);
    const unsigned = await handle(
      new Request("http://localhost/api/inbound/email", { method: "POST", body }),
    );
    expect(unsigned.status).toBe(401);
    const wrong = await handle(
      signed(body, `whsec_${Buffer.from("not-the-secret").toString("base64")}`),
    );
    expect(wrong.status).toBe(401);
  });

  it("ignores recipients that aren't a forwarding address, and other event types", async () => {
    const stranger = await handle(signed(event(`vitest-${randomUUID()}`, ["someone@example.com"])));
    expect(await stranger.json()).toMatchObject({
      ignored: expect.stringMatching(/no forwarding address/),
    });
    const unknown = await handle(
      signed(event(`vitest-${randomUUID()}`, [`deals.${"z".repeat(20)}@${DOMAIN}`])),
    );
    expect(await unknown.json()).toMatchObject({ ignored: "unknown forwarding address" });
    const other = await handle(signed(event("x", [ADDRESS], "email.sent")));
    expect(await other.json()).toMatchObject({ ignored: "event email.sent" });
  });

  it("refuses everything on a production runtime when the signing secret isn't set", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.VERCEL_ENV = "preview";
    try {
      const res = await handle(
        new Request("http://localhost/api/inbound/email", { method: "POST", body: event("y") }),
      );
      expect(res.status).toBe(503);
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = SECRET;
      delete process.env.VERCEL_ENV;
    }
  });
});
