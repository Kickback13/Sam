import "server-only";

import { createClient } from "@/lib/supabase/server";

import { uploadRequestSchema, type UploadResponse } from "../intake/upload-schema";
import { clientKey } from "./client-key";

const json = (body: UploadResponse, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Issue signed upload URLs for the public request form (AZH-013). Validates the
 * slug, types and sizes; the database applies the rate limits and records one
 * ticket per photo; Storage only accepts objects at ticketed paths.
 */
export async function issueUploadSlots(slug: string, request: Request): Promise<Response> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60)
    return json({ ok: false, error: "unavailable" }, 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "photoUpload" }, 400);
  }
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    const error =
      msg === "photoType" || msg === "photoSize" || msg === "photoCount" ? msg : "photoUpload";
    return json({ ok: false, error }, 400);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("azh_issue_upload_tickets", {
    p_slug: slug,
    p_files: parsed.data.files,
    p_phone: parsed.data.phone,
    p_client_key: (await clientKey(slug)) ?? undefined,
  });
  if (error) {
    if (error.code === "PT404") return json({ ok: false, error: "unavailable" }, 404);
    if (error.code === "PT429") return json({ ok: false, error: "rateLimited" }, 429);
    if (error.code === "22023") {
      if (error.message.includes("phone")) return json({ ok: false, error: "phone" }, 400);
      if (error.message.includes("MB")) return json({ ok: false, error: "photoSize" }, 400);
      if (error.message.includes("JPG")) return json({ ok: false, error: "photoType" }, 400);
      return json({ ok: false, error: "photoCount" }, 400);
    }
    console.error("azh_issue_upload_tickets failed", { code: error.code, message: error.message });
    return json({ ok: false, error: "photoUpload" }, 500);
  }

  const slots = [];
  for (const row of data ?? []) {
    const signed = await supabase.storage.from("azh-intake").createSignedUploadUrl(row.path);
    if (signed.error || !signed.data) {
      console.error("createSignedUploadUrl failed", { message: signed.error?.message });
      return json({ ok: false, error: "photoUpload" }, 500);
    }
    slots.push({ path: row.path, token: signed.data.token });
  }
  return json({ ok: true, slots });
}
