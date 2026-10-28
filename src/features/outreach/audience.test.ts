import { describe, expect, it } from "vitest";

import { matchesAudience, planNewsletter, type AudienceContact } from "./audience";
import { parseAudience } from "./schema";

const settings = {
  senderName: "Example",
  mailingAddress: "100 Example St, San Diego, CA",
  timeZone: "America/Los_Angeles",
  sendFrom: 8,
  sendUntil: 21,
};
const none = { emails: new Set<string>(), phones: new Set<string>() };

let n = 0;
const c = (over: Partial<AudienceContact> = {}): AudienceContact => ({
  id: `c${++n}`,
  name: `Contact ${n}`,
  tags: [],
  roles: ["owner"],
  dnc: false,
  smsConsent: "none",
  smsConsentAt: null,
  emailOptOut: false,
  emails: [{ value: `c${n}@example.com`, is_primary: true }],
  phones: [],
  ...over,
});

describe("matchesAudience", () => {
  it("empty audience matches everyone; tags and roles are any-of, case-insensitive tags", () => {
    expect(matchesAudience({ tags: [], roles: [] }, { tags: [], roles: [] })).toBe(true);
    expect(
      matchesAudience({ tags: ["Investor"], roles: [] }, { tags: ["investor"], roles: [] }),
    ).toBe(true);
    expect(
      matchesAudience({ tags: ["hot"], roles: ["broker"] }, { tags: ["hot"], roles: ["owner"] }),
    ).toBe(false);
    expect(
      matchesAudience({ tags: [], roles: ["broker"] }, { tags: [], roles: ["owner", "broker"] }),
    ).toBe(true);
  });
});

describe("planNewsletter", () => {
  it("sends once per address and reports every blocked contact with its reasons", () => {
    const contacts = [
      c(),
      c({ emails: [{ value: "same@example.com" }] }),
      c({ emails: [{ value: "SAME@example.com" }] }),
      c({ dnc: true }),
      c({ emailOptOut: true }),
      c({ emails: [] }),
      c({ roles: ["broker"] }),
    ];
    const plan = planNewsletter(contacts, parseAudience({ roles: ["owner"] }), settings, none);
    expect(plan.matched).toBe(6); // the broker is outside the audience
    expect(plan.sendable.map((r) => r.email)).toEqual([
      contacts[0].emails[0].value,
      "same@example.com",
    ]);
    expect(plan.duplicates).toBe(1);
    expect(plan.summary).toEqual({
      allowed: 2,
      blocked: 3,
      byCode: { dnc: 1, email_opt_out: 1, no_email: 1 },
    });
  });

  it("sends nothing at all until the sender details are set", () => {
    const plan = planNewsletter(
      [c(), c()],
      parseAudience({}),
      { ...settings, mailingAddress: null },
      none,
    );
    expect(plan.sendable).toHaveLength(0);
    expect(plan.summary.byCode.no_mailing_address).toBe(2);
  });

  it("honours the suppression list", () => {
    const x = c();
    const plan = planNewsletter([x], parseAudience({}), settings, {
      emails: new Set([x.emails[0].value]),
      phones: new Set(),
    });
    expect(plan.sendable).toHaveLength(0);
    expect(plan.summary.byCode.email_suppressed).toBe(1);
  });
});

describe("parseAudience", () => {
  it("falls back to everyone on bad data and normalizes tags", () => {
    expect(parseAudience(null)).toEqual({ tags: [], roles: [] });
    expect(parseAudience({ roles: ["nope"] })).toEqual({ tags: [], roles: [] });
    expect(parseAudience({ tags: ["Hot", "hot", " Investor "] }).tags).toEqual(["hot", "investor"]);
  });
});
