import { z } from "zod";

import { normalizeEmail, normalizePhone } from "@/lib/normalize";

import { CONTACT_TIMES, MAX_INTAKE_PHOTOS } from "../constants";

/**
 * Server-side validation for the public request form. Error messages are keys
 * into the i18n dictionary (`errors.*`) so the form can show them in EN or ES.
 * The database trigger re-validates everything (AZH-005).
 */
export const intakeSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60),
  lang: z.enum(["en", "es"]),
  name: z.string().trim().min(1, "name").max(120, "name"),
  phone: z
    .string()
    .trim()
    .max(40, "phone")
    .refine((v) => /^\+1[2-9]\d{9}$/.test(normalizePhone(v) ?? ""), "phone"),
  email: z
    .string()
    .trim()
    .max(254, "email")
    .refine((v) => v === "" || normalizeEmail(v) !== null, "email")
    .transform((v) => v || null),
  job_address: z.string().trim().min(3, "addressShort").max(300, "addressShort"),
  job_zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "zip"),
  service_type: z.string().trim().min(1, "service").max(60, "service"),
  description: z.string().trim().min(1, "description").max(5000, "description"),
  preferred_contact_time: z.enum(CONTACT_TIMES).default("any"),
  photo_paths: z.array(z.string().max(200)).max(MAX_INTAKE_PHOTOS, "photoCount").default([]),
  sms_consent: z.boolean().default(false),
  /** Honeypot: real people never see or fill this. */
  website: z.string().max(500).optional(),
});
export type IntakeInput = z.input<typeof intakeSchema>;

/** Photo path layout the storage policy accepts: <workspace>/<uuid>/<0-4>.<ext>. */
export function intakePhotoPath(workspaceId: string, batchId: string, index: number, ext: string) {
  return `${workspaceId}/${batchId}/${index}.${ext}`;
}

export const PHOTO_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-4]\.(jpg|jpeg|png|webp|heic|heif)$/;
