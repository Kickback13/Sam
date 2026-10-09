import { z } from "zod";

import { CONTACT_ROLE_VALUES } from "@/lib/constants";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";

import { optionalText, optionalUuid, tagsSchema } from "./common";

export const emailEntrySchema = z.object({
  value: z
    .string()
    .trim()
    .max(254)
    .refine((v) => normalizeEmail(v) !== null, "Enter a valid email"),
  label: z.string().trim().max(30).default("work"),
  is_primary: z.boolean().default(false),
});

export const phoneEntrySchema = z.object({
  value: z
    .string()
    .trim()
    .max(40)
    .refine((v) => normalizePhone(v) !== null, "Enter a valid phone number"),
  label: z.string().trim().max(30).default("mobile"),
  type: z.enum(["mobile", "landline", "unknown"]).default("unknown"),
  is_primary: z.boolean().default(false),
});

export type EmailEntry = z.infer<typeof emailEntrySchema>;
export type PhoneEntry = z.infer<typeof phoneEntrySchema>;

/** Ensure exactly one primary entry when the list is non-empty. */
function withPrimary<T extends { is_primary: boolean }>(list: T[]): T[] {
  if (list.length === 0) return list;
  const idx = Math.max(
    0,
    list.findIndex((e) => e.is_primary),
  );
  return list.map((e, i) => ({ ...e, is_primary: i === idx }));
}

export const contactInputSchema = z
  .object({
    first_name: optionalText(100),
    last_name: optionalText(100),
    title: optionalText(150),
    company_id: optionalUuid,
    roles: z.array(z.enum(CONTACT_ROLE_VALUES)).default([]),
    emails: z.array(emailEntrySchema).max(10).default([]).transform(withPrimary),
    phones: z.array(phoneEntrySchema).max(10).default([]).transform(withPrimary),
    address: optionalText(300),
    city: optionalText(100),
    state: optionalText(40),
    zip: optionalText(20),
    source: optionalText(100),
    tags: tagsSchema,
    assigned_to: optionalUuid,
    language: z.enum(["en", "es"]).default("en"),
    dnc: z.boolean().default(false),
    sms_consent: z.enum(["none", "express", "written"]).default("none"),
    sms_consent_source: optionalText(200),
    email_opt_out: z.boolean().default(false),
    notes: optionalText(5000),
  })
  .superRefine((c, ctx) => {
    if (!c.first_name && !c.last_name && c.emails.length === 0 && c.phones.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["first_name"],
        message: "Add a name, email or phone",
      });
    }
    if (c.sms_consent !== "none" && !c.sms_consent_source) {
      ctx.addIssue({
        code: "custom",
        path: ["sms_consent_source"],
        message: "Record how consent was obtained (TCPA)",
      });
    }
  });

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactFormValues = z.input<typeof contactInputSchema>;

export const bulkContactsSchema = z.object({
  workspaceId: z.uuid(),
  contactIds: z.array(z.uuid()).min(1).max(500),
});
