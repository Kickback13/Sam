"use server";

import { createClient } from "@/lib/supabase/server";

import { consentText } from "../../intake/i18n";
import { intakeSchema, PHOTO_PATH_RE } from "../../intake/schema";
import { clientKey } from "../client-key";

export type IntakeResult =
  | { ok: true }
  | {
      ok: false;
      error: "generic" | "unavailable" | "rateLimited" | "fix" | "photoUpload";
      fields?: Record<string, string>;
    };

/**
 * Public homeowner request (no login). Validates, drops honeypot submissions,
 * then INSERTs into azh_intake as the visitor (anon). The database trigger
 * does the rest (AZH-005). Nothing is sent to the homeowner.
 */
export async function submitIntake(input: unknown): Promise<IntakeResult> {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      fields[key] ??= issue.message;
    }
    return { ok: false, error: "fix", fields };
  }
  const v = parsed.data;
  // Honeypot filled: pretend it worked, store nothing.
  if (v.website && v.website.trim() !== "") return { ok: true };
  if (v.photo_paths.some((p) => !PHOTO_PATH_RE.test(p))) return { ok: false, error: "photoUpload" };

  const supabase = await createClient();
  const { error } = await supabase.from("azh_intake").insert({
    workspace_slug: v.slug,
    name: v.name,
    phone: v.phone,
    email: v.email,
    job_address: v.job_address,
    job_zip: v.job_zip,
    service_type: v.service_type,
    description: v.description,
    preferred_contact_time: v.preferred_contact_time,
    language: v.lang,
    photo_paths: v.photo_paths,
    sms_consent: v.sms_consent,
    consent_text: v.sms_consent ? consentText(v.lang) : null,
    page_url: `/r/${v.slug}`,
    client_key: await clientKey(v.slug),
  });
  if (!error) return { ok: true };

  switch (error.code) {
    case "PT429":
      return { ok: false, error: "rateLimited" };
    case "PT404":
      return { ok: false, error: "unavailable" };
    case "22023":
      if (error.message.includes("photo")) return { ok: false, error: "photoUpload" };
      if (error.message.includes("phone"))
        return { ok: false, error: "fix", fields: { phone: "phone" } };
      if (error.message.includes("email"))
        return { ok: false, error: "fix", fields: { email: "email" } };
      if (error.message.includes("service"))
        return { ok: false, error: "fix", fields: { service_type: "service" } };
      return { ok: false, error: "fix" };
    default:
      console.error("azh intake insert failed", { code: error.code, message: error.message });
      return { ok: false, error: "generic" };
  }
}
