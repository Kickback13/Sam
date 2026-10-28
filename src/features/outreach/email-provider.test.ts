import { describe, expect, it, vi } from "vitest";

import {
  formatFrom,
  outreachEmailConfig,
  resendProvider,
  type OutgoingEmail,
} from "./email-provider";

describe("outreachEmailConfig", () => {
  it("is off by default — no switch, no key", () => {
    const c = outreachEmailConfig({});
    expect(c.enabled).toBe(false);
    expect(c.reason).toContain("OUTREACH_EMAIL");
  });

  it("needs the key as well as the switch", () => {
    expect(outreachEmailConfig({ OUTREACH_EMAIL: "on" }).reason).toContain("RESEND_API_KEY");
    expect(outreachEmailConfig({ OUTREACH_EMAIL: "on", RESEND_API_KEY: "re_x" }).enabled).toBe(
      true,
    );
  });

  it("never sends from a Vercel preview, even fully configured", () => {
    const c = outreachEmailConfig({
      OUTREACH_EMAIL: "on",
      RESEND_API_KEY: "re_x",
      VERCEL_ENV: "preview",
    });
    expect(c.enabled).toBe(false);
    expect(c.reason).toContain("Preview");
  });
});

const email = (ref: string): OutgoingEmail => ({
  ref,
  from: "Example <news@example.com>",
  to: `${ref}@example.com`,
  replyTo: "sam@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  unsubscribeUrl: `https://app.example.com/unsubscribe/${ref}`,
});

describe("resendProvider", () => {
  const cfg = { enabled: true, apiKey: "re_test", reason: null };

  it("refuses to send when not connected", async () => {
    const fetchImpl = vi.fn();
    const p = resendProvider({ enabled: false, apiKey: null, reason: "off" }, fetchImpl);
    await expect(p.sendBatch([email("a")])).rejects.toThrow("off");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts one batch with one-click unsubscribe headers and maps ids back", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: "id-a" }, { id: "id-b" }] }));
    const out = await resendProvider(cfg, fetchImpl as unknown as typeof fetch).sendBatch([
      email("a"),
      email("b"),
    ]);
    expect(out).toEqual([
      { ref: "a", ok: true, providerId: "id-a" },
      { ref: "b", ok: true, providerId: "id-b" },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/batch");
    const body = JSON.parse(init.body as string);
    expect(body[0]).toMatchObject({
      to: ["a@example.com"],
      reply_to: "sam@example.com",
      headers: {
        "List-Unsubscribe": "<https://app.example.com/unsubscribe/a>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  });

  it("marks every email failed on an error response or network failure", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 422 }));
    expect(
      await resendProvider(cfg, bad as unknown as typeof fetch).sendBatch([email("a")]),
    ).toEqual([{ ref: "a", ok: false, error: "Resend returned 422" }]);
    const down = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const [r] = await resendProvider(cfg, down as unknown as typeof fetch).sendBatch([email("a")]);
    expect(r.ok).toBe(false);
  });
});

describe("formatFrom", () => {
  it("quotes names with punctuation and strips header-breaking characters", () => {
    expect(formatFrom("Housing4All", "n@e.com")).toBe("Housing4All <n@e.com>");
    expect(formatFrom("AZH Builders, Inc.", "n@e.com")).toBe('"AZH Builders, Inc." <n@e.com>');
    expect(formatFrom('Evil"\r\nBcc: x', "n@e.com")).toBe('"EvilBcc: x" <n@e.com>');
  });
});
