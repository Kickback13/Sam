import { z } from "zod";

import { CONTACT_ROLE_VALUES } from "@/lib/constants";
import { optionalText, requiredText } from "@/lib/validation/common";

export const TIME_ZONES = [
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
] as const;

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email");

const hour = (min: number, max: number) =>
  z.coerce.number({ error: "Pick an hour" }).int().min(min).max(max);

/** Settings → Outreach. Texting hours can be narrowed, never widened past 8am–9pm. */
export const outreachSettingsSchema = z
  .object({
    sender_name: optionalText(120),
    from_email: optionalEmail,
    reply_to: optionalEmail,
    mailing_address: optionalText(500).refine(
      (v) => v === null || v.length >= 5,
      "Enter the full mailing address",
    ),
    time_zone: z.enum(TIME_ZONES.map((t) => t.value) as [string, ...string[]]),
    sms_send_from: hour(8, 20),
    sms_send_until: hour(9, 21),
  })
  .refine((v) => v.sms_send_from < v.sms_send_until, {
    path: ["sms_send_until"],
    message: "Must be later than the start hour",
  });
export type OutreachSettingsInput = z.input<typeof outreachSettingsSchema>;

const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(20)
  .default([])
  .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))]);

export const audienceSchema = z.object({
  /** Contacts with ANY of these tags (empty = no tag filter). */
  tags: tagList,
  /** Contacts with ANY of these roles (empty = no role filter). */
  roles: z.array(z.enum(CONTACT_ROLE_VALUES)).max(CONTACT_ROLE_VALUES.length).default([]),
});
export type Audience = z.output<typeof audienceSchema>;

export function parseAudience(raw: unknown): Audience {
  const r = audienceSchema.safeParse(raw ?? {});
  return r.success ? r.data : { tags: [], roles: [] };
}

export const newsletterSchema = z.object({
  subject: requiredText(200, "Add a subject line"),
  preheader: optionalText(200),
  body: z.string().max(50000, "Keep it under 50,000 characters").default(""),
  audience: audienceSchema,
});
export type NewsletterInput = z.input<typeof newsletterSchema>;

export const suppressionSchema = z.object({
  channel: z.enum(["email", "sms"]),
  value: requiredText(254, "Enter an email or phone number"),
  note: optionalText(500),
});
