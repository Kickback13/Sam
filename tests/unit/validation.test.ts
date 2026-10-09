import { describe, expect, it } from "vitest";
import { z } from "zod";

import { contactInputSchema } from "@/lib/validation/contact";
import { companyInputSchema } from "@/lib/validation/company";
import { optionalDate, optionalDateTime, optionalNumber, optionalText, optionalUuid, tagsSchema } from "@/lib/validation/common";
import { dealInputSchema } from "@/lib/validation/deal";
import { propertyInputSchema } from "@/lib/validation/property";
import { taskInputSchema } from "@/lib/validation/task";

describe("optional helpers", () => {
  const schema = z.object({
    text: optionalText(10),
    num: optionalNumber({ min: 0 }),
    id: optionalUuid,
    date: optionalDate,
    at: optionalDateTime,
    tags: tagsSchema,
  });

  it("treat missing keys as null/empty", () => {
    expect(schema.parse({})).toEqual({ text: null, num: null, id: null, date: null, at: null, tags: [] });
  });

  it("treat empty strings as null", () => {
    expect(schema.parse({ text: "  ", num: "", id: "", date: "", at: "" })).toMatchObject({
      text: null,
      num: null,
      id: null,
      date: null,
      at: null,
    });
  });

  it("parse money-ish strings into numbers", () => {
    expect(schema.parse({ num: "$1,250,000" }).num).toBe(1250000);
    expect(schema.safeParse({ num: "-5" }).success).toBe(false);
    expect(schema.safeParse({ num: "abc" }).success).toBe(false);
  });

  it("trims and enforces max length", () => {
    expect(schema.parse({ text: "  hi  " }).text).toBe("hi");
    expect(schema.safeParse({ text: "x".repeat(11) }).success).toBe(false);
  });

  it("normalizes tags", () => {
    expect(schema.parse({ tags: [" Long Hold ", "long-hold", "", "VIP"] }).tags).toEqual(["long-hold", "vip"]);
  });
});

describe("contactInputSchema", () => {
  it("accepts a minimal contact with just a name", () => {
    const c = contactInputSchema.parse({ first_name: "Ana" });
    expect(c).toMatchObject({ first_name: "Ana", last_name: null, roles: [], emails: [], sms_consent: "none", language: "en" });
  });

  it("requires a name, email or phone", () => {
    const r = contactInputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("accepts a contact identified only by phone", () => {
    expect(contactInputSchema.safeParse({ phones: [{ value: "619-555-0100" }] }).success).toBe(true);
  });

  it("rejects invalid emails and phones", () => {
    expect(contactInputSchema.safeParse({ first_name: "A", emails: [{ value: "nope" }] }).success).toBe(false);
    expect(contactInputSchema.safeParse({ first_name: "A", phones: [{ value: "12" }] }).success).toBe(false);
  });

  it("keeps exactly one primary email", () => {
    const c = contactInputSchema.parse({
      first_name: "A",
      emails: [{ value: "a@example.com" }, { value: "b@example.com", is_primary: true }],
    });
    expect(c.emails.map((e) => e.is_primary)).toEqual([false, true]);
    const d = contactInputSchema.parse({ first_name: "A", emails: [{ value: "a@example.com" }, { value: "b@example.com" }] });
    expect(d.emails.map((e) => e.is_primary)).toEqual([true, false]);
  });

  it("requires TCPA consent evidence when SMS consent is recorded", () => {
    const r = contactInputSchema.safeParse({ first_name: "A", sms_consent: "express" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["sms_consent_source"]);
    expect(contactInputSchema.safeParse({ first_name: "A", sms_consent: "written", sms_consent_source: "Signed form" }).success).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(contactInputSchema.safeParse({ first_name: "A", roles: ["wizard"] }).success).toBe(false);
  });
});

describe("other entity schemas", () => {
  it("company requires a name", () => {
    expect(companyInputSchema.safeParse({}).success).toBe(false);
    expect(companyInputSchema.parse({ name: "Acme", email: "" })).toMatchObject({ name: "Acme", email: null, type: null });
  });

  it("property requires an address and defaults county/state", () => {
    expect(propertyInputSchema.safeParse({}).success).toBe(false);
    const p = propertyInputSchema.parse({ address: "1 Main St", units: "24", year_built: "1965" });
    expect(p).toMatchObject({ state: "CA", county: "San Diego", units: 24, year_built: 1965, property_type: null });
    expect(propertyInputSchema.safeParse({ address: "x", units: "2.5" }).success).toBe(false);
    expect(propertyInputSchema.safeParse({ address: "x", year_built: "1500" }).success).toBe(false);
  });

  it("deal requires title, pipeline and stage", () => {
    expect(dealInputSchema.safeParse({ title: "x" }).success).toBe(false);
    const id = "3f1c6d2e-8a4b-4c1d-9e2f-1a2b3c4d5e6f";
    expect(dealInputSchema.parse({ title: "24 units", pipeline_id: id, stage_id: id, value: "$4,950,000" }).value).toBe(4950000);
  });

  it("task related type and id go together", () => {
    const ws = "3f1c6d2e-8a4b-4c1d-9e2f-1a2b3c4d5e6f";
    expect(taskInputSchema.safeParse({ workspaceId: ws, title: "Call", related_type: "contact" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ workspaceId: ws, title: "Call" }).success).toBe(true);
  });
});
