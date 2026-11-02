import { z } from "zod";

import { optionalNumber, optionalText, requiredText } from "@/lib/validation/common";

export const MEMBER_TYPES = [
  { value: "investor", label: "Investor" },
  { value: "broker", label: "Broker" },
  { value: "lender", label: "Lender" },
  { value: "property_manager", label: "Property manager" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
] as const;
export type MemberType = (typeof MEMBER_TYPES)[number]["value"];
const MEMBER_TYPE_VALUES = MEMBER_TYPES.map((t) => t.value) as [MemberType, ...MemberType[]];
export const memberTypeLabel = (v: string) => MEMBER_TYPES.find((t) => t.value === v)?.label ?? v;

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email");

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Start the link with https://");

export const inviteSchema = z.object({
  email: optionalEmail,
  name: optionalText(120),
  member_type: z.enum(MEMBER_TYPE_VALUES).default("investor"),
});

export const postSchema = z
  .object({
    kind: z.enum(["update", "deal"]).default("update"),
    title: requiredText(200, "Add a title"),
    body: z.string().max(10000).default(""),
    property_type: optionalText(40),
    units: optionalNumber({ min: 1, max: 100000, int: true }),
    price: optionalNumber({ min: 1, max: 999999999999 }),
    city: optionalText(100),
    zip: optionalText(20),
    link: optionalUrl,
  })
  .transform((p) =>
    p.kind === "update"
      ? { ...p, property_type: null, units: null, price: null, city: null, zip: null }
      : p,
  );

export const commentSchema = z.object({ body: requiredText(2000, "Write a comment") });

export const eventSchema = z
  .object({
    title: requiredText(200, "Add a title"),
    description: z.string().max(5000).default(""),
    starts_at: z.iso.datetime({ offset: true, error: "Pick a start time" }),
    ends_at: z.iso
      .datetime({ offset: true })
      .nullish()
      .transform((v) => v ?? null),
    location: optionalText(300),
    url: optionalUrl,
  })
  .refine((e) => !e.ends_at || e.ends_at >= e.starts_at, {
    path: ["ends_at"],
    message: "Must end after it starts",
  });

export const profileSchema = z.object({
  display_name: requiredText(120, "Add your name"),
  headline: optionalText(160),
  bio: optionalText(2000),
  city: optionalText(100),
  show_in_directory: z.boolean(),
  public_email: optionalEmail,
  public_phone: optionalText(40),
});

export const memberAdminSchema = z.object({
  member_type: z.enum(MEMBER_TYPE_VALUES),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]),
  status: z.enum(["active", "removed"]),
});
