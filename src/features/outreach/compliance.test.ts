import { describe, expect, it } from "vitest";

import {
  checkEmail,
  checkSms,
  classifyInboundSms,
  quietHours,
  summarizeBlocks,
  type GateContact,
  type GateSettings,
  type Suppressions,
} from "./compliance";

const settings: GateSettings = {
  senderName: "Example Realty",
  mailingAddress: "100 Example St, San Diego, CA 92104",
  timeZone: "America/Los_Angeles",
  sendFrom: 8,
  sendUntil: 21,
};

const none: Suppressions = { emails: new Set(), phones: new Set() };

const contact = (over: Partial<GateContact> = {}): GateContact => ({
  dnc: false,
  smsConsent: "written",
  smsConsentAt: "2026-09-01T00:00:00Z",
  emailOptOut: false,
  emails: [{ value: "Alex@Example.com", is_primary: true }],
  phones: [{ value: "(619) 555-0100", type: "mobile", is_primary: true }],
  ...over,
});

// 2026-10-28 is PDT (UTC-7): 19:00Z = noon local, 05:00Z = 10pm local the day before.
const NOON = new Date("2026-10-28T19:00:00Z");
const TEN_PM = new Date("2026-10-29T05:00:00Z");
const SEVEN_AM = new Date("2026-10-28T14:00:00Z");

const codes = (r: { blocks: { code: string }[] }) => r.blocks.map((b) => b.code);

describe("checkEmail", () => {
  it("allows a clean contact and normalizes the address", () => {
    const r = checkEmail(contact(), settings, none);
    expect(r.allowed).toBe(true);
    expect(r.to).toBe("alex@example.com");
  });

  it("uses the primary address first", () => {
    const r = checkEmail(
      contact({
        emails: [{ value: "b@example.com" }, { value: "a@example.com", is_primary: true }],
      }),
      settings,
      none,
    );
    expect(r.to).toBe("a@example.com");
  });

  it("blocks DNC, opt-out, missing email and suppressed addresses", () => {
    expect(codes(checkEmail(contact({ dnc: true }), settings, none))).toEqual(["dnc"]);
    expect(codes(checkEmail(contact({ emailOptOut: true }), settings, none))).toEqual([
      "email_opt_out",
    ]);
    expect(codes(checkEmail(contact({ emails: [] }), settings, none))).toEqual(["no_email"]);
    expect(
      codes(checkEmail(contact({ emails: [{ value: "not-an-email" }] }), settings, none)),
    ).toEqual(["no_email"]);
    const sup = { emails: new Set(["alex@example.com"]), phones: new Set<string>() };
    expect(codes(checkEmail(contact(), settings, sup))).toEqual(["email_suppressed"]);
  });

  it("blocks every email until the CAN-SPAM sender details are set", () => {
    const r = checkEmail(contact(), { ...settings, senderName: " ", mailingAddress: null }, none);
    expect(r.allowed).toBe(false);
    expect(codes(r)).toEqual(["no_sender", "no_mailing_address"]);
  });
});

describe("checkSms", () => {
  it("allows a marketing text with written consent at noon Pacific", () => {
    const r = checkSms(contact(), settings, none, "marketing", NOON);
    expect(r.allowed).toBe(true);
    expect(r.to).toBe("+16195550100");
  });

  it("requires written consent for marketing, express is enough for informational", () => {
    const c = contact({ smsConsent: "express" });
    expect(codes(checkSms(c, settings, none, "marketing", NOON))).toEqual([
      "needs_written_consent",
    ]);
    expect(checkSms(c, settings, none, "informational", NOON).allowed).toBe(true);
  });

  it("blocks without consent, or with a consent level but no consent date", () => {
    expect(
      codes(checkSms(contact({ smsConsent: "none" }), settings, none, "informational", NOON)),
    ).toEqual(["no_sms_consent"]);
    expect(
      codes(checkSms(contact({ smsConsentAt: null }), settings, none, "informational", NOON)),
    ).toEqual(["no_sms_consent"]);
  });

  it("blocks DNC, landlines and missing numbers", () => {
    expect(codes(checkSms(contact({ dnc: true }), settings, none, "marketing", NOON))).toEqual([
      "dnc",
    ]);
    expect(
      codes(
        checkSms(
          contact({ phones: [{ value: "6195550100", type: "landline" }] }),
          settings,
          none,
          "marketing",
          NOON,
        ),
      ),
    ).toEqual(["landline"]);
    expect(codes(checkSms(contact({ phones: [] }), settings, none, "marketing", NOON))).toEqual([
      "no_phone",
    ]);
  });

  it("skips a landline and texts the mobile number", () => {
    const r = checkSms(
      contact({
        phones: [
          { value: "6195550101", type: "landline", is_primary: true },
          { value: "6195550102", type: "mobile" },
        ],
      }),
      settings,
      none,
      "marketing",
      NOON,
    );
    expect(r.allowed).toBe(true);
    expect(r.to).toBe("+16195550102");
  });

  it("warns (but allows) when the phone type is unknown", () => {
    const r = checkSms(
      contact({ phones: [{ value: "6195550103", type: "unknown" }] }),
      settings,
      none,
      "marketing",
      NOON,
    );
    expect(r.allowed).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });

  it("a STOP on any of the contact's numbers blocks all texts to them", () => {
    const sup = { emails: new Set<string>(), phones: new Set(["+16195550199"]) };
    const c = contact({
      phones: [
        { value: "(619) 555-0100", type: "mobile", is_primary: true },
        { value: "619-555-0199", type: "mobile" },
      ],
    });
    expect(codes(checkSms(c, settings, sup, "informational", NOON))).toEqual(["sms_stopped"]);
  });

  it("enforces quiet hours in the workspace time zone and says when texting reopens", () => {
    const late = checkSms(contact(), settings, none, "marketing", TEN_PM);
    expect(codes(late)).toEqual(["quiet_hours"]);
    expect(late.blocks[0].message).toContain("8am–9pm Pacific");
    expect(late.nextAllowedAt?.toISOString()).toBe("2026-10-29T15:00:00.000Z"); // 8am PDT
    const early = checkSms(contact(), settings, none, "marketing", SEVEN_AM);
    expect(codes(early)).toEqual(["quiet_hours"]);
    expect(early.nextAllowedAt?.toISOString()).toBe("2026-10-28T15:00:00.000Z");
  });

  it("collects every failing gate, not just the first", () => {
    const r = checkSms(
      contact({ dnc: true, smsConsent: "none", smsConsentAt: null }),
      settings,
      none,
      "marketing",
      TEN_PM,
    );
    expect(codes(r)).toEqual(["dnc", "no_sms_consent", "quiet_hours"]);
  });
});

describe("quietHours", () => {
  it("treats the end hour as exclusive", () => {
    // 20:59 local is in; 21:00 local is out.
    expect(quietHours(new Date("2026-10-29T03:59:00Z"), settings.timeZone, 8, 21).inWindow).toBe(
      true,
    );
    expect(quietHours(new Date("2026-10-29T04:00:00Z"), settings.timeZone, 8, 21).inWindow).toBe(
      false,
    );
  });

  it("follows the recipient zone, not UTC", () => {
    // 19:00Z is noon in Los Angeles but 3pm in New York — both inside 8–21.
    expect(quietHours(NOON, "America/New_York", 8, 21).inWindow).toBe(true);
    // 02:00Z is 7pm in LA (in) but 10pm in New York (out).
    const t = new Date("2026-10-29T02:00:00Z");
    expect(quietHours(t, "America/Los_Angeles", 8, 21).inWindow).toBe(true);
    expect(quietHours(t, "America/New_York", 8, 21).inWindow).toBe(false);
  });
});

describe("classifyInboundSms", () => {
  it.each([
    ["STOP", "stop"],
    [" stop ", "stop"],
    ["Stop.", "stop"],
    ["unsubscribe", "stop"],
    ["Opt out", "stop"],
    ["QUIT!", "stop"],
    ["START", "start"],
    ["unstop", "start"],
    ["help", "help"],
    ["don't stop the deal", null],
    ["Yes please call me", null],
    ["", null],
  ])("%j → %s", (body, expected) => {
    expect(classifyInboundSms(body)).toBe(expected);
  });
});

describe("summarizeBlocks", () => {
  it("counts allowed, blocked and each reason", () => {
    const rs = [
      checkEmail(contact(), settings, none),
      checkEmail(contact({ dnc: true, emailOptOut: true }), settings, none),
      checkEmail(contact({ emails: [] }), settings, none),
    ];
    expect(summarizeBlocks(rs)).toEqual({
      allowed: 1,
      blocked: 2,
      byCode: { dnc: 1, email_opt_out: 1, no_email: 1 },
    });
  });
});
