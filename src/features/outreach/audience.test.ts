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
    expect(matchesAudience({ tags: [], roles: [] }, { tags: [], roles: [], network: false })).toBe(
      true,
    );
    expect(
      matchesAudience(
        { tags: ["Investor"], roles: [] },
        { tags: ["investor"], roles: [], network: false },
      ),
    ).toBe(true);
    expect(
      matchesAudience(
        { tags: ["hot"], roles: ["broker"] },
        { tags: ["hot"], roles: ["owner"], network: false },
      ),
    ).toBe(false);
    expect(
      matchesAudience(
        { tags: [], roles: ["broker"] },
        { tags: [], roles: ["owner", "broker"], network: false },
      ),
    ).toBe(true);
  });
});

describe("Network-only audience", () => {
  it("keeps only contacts linked to an active Network member", () => {
    const a = parseAudience({ network: true });
    expect(matchesAudience({ tags: [], roles: [], networkMember: true }, a)).toBe(true);
    expect(matchesAudience({ tags: [], roles: [], networkMember: false }, a)).toBe(false);
    expect(matchesAudience({ tags: [], roles: [] }, a)).toBe(false);
    const plan = planNewsletter(
      [c({ networkMember: true }), c(), c({ networkMember: true, emailOptOut: true })],
      a,
      settings,
      none,
    );
    expect(plan.matched).toBe(2);
    expect(plan.sendable).toHaveLength(1); // the opted-out member is still blocked
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
    expect(parseAudience(null)).toEqual({ tags: [], roles: [], network: false });
    expect(parseAudience({ roles: ["nope"] })).toEqual({ tags: [], roles: [], network: false });
    expect(parseAudience({ tags: ["Hot", "hot", " Investor "] }).tags).toEqual(["hot", "investor"]);
  });
});
