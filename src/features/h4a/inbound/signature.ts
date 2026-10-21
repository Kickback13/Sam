/**
 * Webhook signature verification for Resend (Svix / Standard Webhooks scheme).
 *
 *   signed content = `${id}.${timestamp}.${rawBody}`
 *   signature      = base64(HMAC-SHA256(base64decode(secret without "whsec_"), signed content))
 *   header         = space-separated "v1,<signature>" entries (any one may match)
 *
 * Headers arrive as svix-id / svix-timestamp / svix-signature (or the
 * webhook-* equivalents). Timestamps more than 5 minutes off are rejected to
 * stop replays. Comparison is constant-time. Server-only (node:crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type SignatureHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function signatureHeaders(get: (name: string) => string | null): SignatureHeaders {
  return {
    id: get("svix-id") ?? get("webhook-id"),
    timestamp: get("svix-timestamp") ?? get("webhook-timestamp"),
    signature: get("svix-signature") ?? get("webhook-signature"),
  };
}

function secretBytes(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(raw, "base64");
}

export function sign(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", secretBytes(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" };

export function verifySignature(
  secret: string,
  headers: SignatureHeaders,
  body: string,
  now: Date = new Date(),
): VerifyResult {
  if (!headers.id || !headers.timestamp || !headers.signature)
    return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(headers.timestamp)) return { ok: false, reason: "bad_timestamp" };
  const ts = Number(headers.timestamp);
  if (Math.abs(now.getTime() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS)
    return { ok: false, reason: "stale" };

  const expected = Buffer.from(sign(secret, headers.id, headers.timestamp, body), "base64");
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    let given: Buffer;
    try {
      given = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}
