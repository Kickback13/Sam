import { describe, expect, it } from "vitest";

import { cleanText, formatPhone, normalizeEmail, normalizePhone, parseTags } from "@/lib/normalize";

import { EMAIL_CASES, PHONE_CASES } from "../fixtures/normalize-cases";

describe("normalizeEmail", () => {
  it.each(EMAIL_CASES)("%s → %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
  it("ignores non-strings", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it.each(PHONE_CASES)("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it("accepts numbers", () => {
    expect(normalizePhone(6195550100)).toBe("+16195550100");
  });
});

describe("formatPhone / cleanText / parseTags", () => {
  it("formats US numbers for display", () => {
    expect(formatPhone("6195550100")).toBe("(619) 555-0100");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone(null)).toBe("");
  });
  it("collapses whitespace", () => {
    expect(cleanText("  a   b \n c ")).toBe("a b c");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
  it("splits and normalizes tags", () => {
    expect(parseTags("Long Hold, VIP;north park|vip")).toEqual(["long-hold", "vip", "north-park"]);
    expect(parseTags(undefined)).toEqual([]);
  });
});
