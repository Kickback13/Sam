import { describe, expect, it, vi } from "vitest";

import { sendTwilioSms, SmsSendError, smsProviderConfig, smsSegments } from "./sms-provider";

const SID = `AC${"0".repeat(32)}`;
const cfg = smsProviderConfig({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "tok" });

describe("Twilio SMS adapter", () => {
  it("is not connected without both credentials or with a malformed account SID", () => {
    expect(smsProviderConfig({}).connected).toBe(false);
    expect(smsProviderConfig({ TWILIO_AUTH_TOKEN: "x" }).connected).toBe(false);
    expect(
      smsProviderConfig({ TWILIO_ACCOUNT_SID: "nope", TWILIO_AUTH_TOKEN: "x" }).connected,
    ).toBe(false);
    expect(cfg.connected).toBe(true);
  });

  it("posts one form-encoded message with basic auth and returns the SID", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ sid: `SM${"a".repeat(32)}`, status: "queued" }, { status: 201 }),
    );
    const r = await sendTwilioSms(
      cfg,
      { to: "+16195550100", body: "Hi", from: "+16195550199", statusCallback: "https://x/cb" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(r.sid).toBe(`SM${"a".repeat(32)}`);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${SID}:tok`).toString("base64")}`,
    );
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      To: "+16195550100",
      Body: "Hi",
      From: "+16195550199",
      StatusCallback: "https://x/cb",
    });
  });

  it("prefers a Messaging Service over a number and refuses without either", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ sid: `SM${"b".repeat(32)}` }));
    await sendTwilioSms(
      cfg,
      { to: "+16195550100", body: "Hi", from: "+16195550199", messagingServiceSid: "MG1" },
      fetchImpl as unknown as typeof fetch,
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get("MessagingServiceSid")).toBe("MG1");
    expect(body.get("From")).toBeNull();
    await expect(sendTwilioSms(cfg, { to: "+16195550100", body: "Hi" })).rejects.toThrow(
      "Set a sending number",
    );
  });

  it("turns Twilio errors into plain messages and never sends when not connected", async () => {
    const bad = vi.fn(async () => Response.json({ message: "Invalid To number" }, { status: 400 }));
    await expect(
      sendTwilioSms(
        cfg,
        { to: "+1", body: "x", from: "+16195550199" },
        bad as unknown as typeof fetch,
      ),
    ).rejects.toThrow("Twilio: Invalid To number");
    const never = vi.fn();
    await expect(
      sendTwilioSms(
        smsProviderConfig({}),
        { to: "+16195550100", body: "x", from: "+16195550199" },
        never as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(SmsSendError);
    expect(never).not.toHaveBeenCalled();
  });

  it("counts billing segments", () => {
    expect(smsSegments("")).toBe(0);
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("Hola 🙂")).toBe(1);
    expect(smsSegments("🙂".repeat(71))).toBe(2);
  });
});
