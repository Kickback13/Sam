import { describe, expect, it, vi } from "vitest";

import {
  findToken,
  formatAddress,
  generateToken,
  hashToken,
  tokenFromAddress,
  tokenHint,
} from "./address";
import { fetchReceivedEmail, receivedEventSchema, recipientsOf } from "./resend";

describe("forwarding address tokens", () => {
  it("generates 20 lowercase base32 characters", () => {
    const t = generateToken();
    expect(t).toMatch(/^[a-z2-7]{20}$/);
    expect(generateToken()).not.toBe(t);
    expect(generateToken(Buffer.alloc(20, 0))).toBe("a".repeat(20));
  });
  it("hashes case-insensitively and gives a short hint", () => {
    expect(hashToken("ABCDEFGHIJKLMNOPQRST")).toBe(hashToken("abcdefghijklmnopqrst"));
    expect(hashToken("abcdefghijklmnopqrst")).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHint("abcdefghijklmnopqrst")).toBe("qrst");
  });
  it("round-trips through an address on the inbound domain only", () => {
    const token = "abcdefghijklmnopqrst";
    const address = formatAddress(token, "inbound.example.com");
    expect(address).toBe("deals.abcdefghijklmnopqrst@inbound.example.com");
    expect(tokenFromAddress(address, "inbound.example.com")).toBe(token);
    expect(tokenFromAddress(`Deals <${address.toUpperCase()}>`, "inbound.example.com")).toBe(token);
    expect(tokenFromAddress(address, "other.example.com")).toBeNull();
    expect(tokenFromAddress("sam@inbound.example.com", "inbound.example.com")).toBeNull();
    expect(tokenFromAddress("deals.short@inbound.example.com", "inbound.example.com")).toBeNull();
  });
  it("finds the first recipient that is a forwarding address", () => {
    expect(
      findToken(["sam@example.com", "deals.abcdefghijklmnopqrst@in.example.com"], "in.example.com"),
    ).toBe("abcdefghijklmnopqrst");
    expect(findToken(["sam@example.com"], "in.example.com")).toBeNull();
  });
});

describe("Resend email.received payload", () => {
  const event = {
    type: "email.received",
    created_at: "2026-10-20T12:00:00.000Z",
    data: {
      email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      created_at: "2026-10-20T12:00:00.000Z",
      from: "LoopNet <alerts@loopnet.example>",
      to: ["sam@example.com"],
      bcc: [],
      cc: [],
      received_for: ["deals.abcdefghijklmnopqrst@in.example.com"],
      message_id: "<m1@example.com>",
      subject: "New listing",
      attachments: [],
    },
  };
  it("parses the metadata-only webhook and lists every recipient", () => {
    const parsed = receivedEventSchema.parse(event);
    expect(recipientsOf(parsed)).toEqual([
      "deals.abcdefghijklmnopqrst@in.example.com",
      "sam@example.com",
    ]);
  });
  it("rejects other event types", () => {
    expect(receivedEventSchema.safeParse({ ...event, type: "email.sent" }).success).toBe(false);
  });
  it("fetches the body from the Receiving API with the API key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: "e1", from: "a@b.c", subject: "S", html: "<p>x</p>", text: "x" }),
          {
            status: 200,
          },
        ),
    );
    const email = await fetchReceivedEmail("e1", { apiKey: "re_test", fetch: fetchMock });
    expect(email).toMatchObject({ id: "e1", html: "<p>x</p>", text: "x" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/e1?html_format=cid",
      {
        headers: { Authorization: "Bearer re_test", Accept: "application/json" },
      },
    );
  });
  it("throws on API errors so the job retries", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(fetchReceivedEmail("e1", { apiKey: "k", fetch: fetchMock })).rejects.toThrow(
      /503/,
    );
  });
});
