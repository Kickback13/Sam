import "server-only";

import { findToken } from "../inbound/address";
import { receivedEventSchema, recipientsOf } from "../inbound/resend";
import { signatureHeaders, verifySignature } from "../inbound/signature";
import { dispatchInboundEmail } from "../jobs/dispatch";
import { inboundConfig, isProductionRuntime } from "./config";
import { inboundClient } from "./stores";

const MAX_BODY_BYTES = 256 * 1024; // the webhook is metadata only

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/inbound/email — Resend "email.received" webhook.
 *
 * 1. Verify the Svix signature whenever RESEND_WEBHOOK_SECRET is set; refuse
 *    unsigned requests on any production runtime (Vercel prod + previews).
 * 2. Match a recipient to a workspace forwarding address (deals.<token>@domain).
 * 3. Record the email (idempotent per Resend email id) and hand off to the job
 *    (Inngest, or inline when Inngest isn't configured).
 * Unknown recipients and non-email events get 200 so Resend doesn't retry them.
 */
export async function handleInboundEmailWebhook(request: Request): Promise<Response> {
  const cfg = inboundConfig();
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });

  if (cfg.webhookSecret) {
    const verified = verifySignature(
      cfg.webhookSecret,
      signatureHeaders((n) => request.headers.get(n)),
      raw,
    );
    if (!verified.ok) return json(401, { error: "Invalid signature", reason: verified.reason });
  } else if (isProductionRuntime()) {
    return json(503, {
      error: "Inbound email is not connected (RESEND_WEBHOOK_SECRET is not set).",
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  const type = (payload as { type?: unknown })?.type;
  if (type !== "email.received") return json(200, { ignored: `event ${String(type)}` });
  const parsed = receivedEventSchema.safeParse(payload);
  if (!parsed.success) return json(400, { error: "Unexpected email.received payload" });
  const event = parsed.data;

  const token = findToken(recipientsOf(event), cfg.domain);
  if (!token) return json(200, { ignored: "no forwarding address among the recipients" });

  const { data, error } = await inboundClient().rpc("h4a_inbound_receive", {
    p_token: token,
    p_email: {
      provider_email_id: event.data.email_id,
      message_id: event.data.message_id ?? null,
      from: event.data.from,
      to: recipientsOf(event).slice(0, 50),
      subject: event.data.subject ?? null,
      received_at: event.data.created_at ?? event.created_at,
    },
  });
  if (error) {
    if (error.code === "42501") return json(200, { ignored: "unknown forwarding address" });
    if (error.code === "PT429") return json(429, { error: "Too many emails; try again later" });
    console.error("h4a inbound receive failed", { code: error.code, message: error.message });
    return json(500, { error: "Could not record the email" });
  }
  const received = data as {
    email_id: string;
    workspace_slug: string | null;
    duplicate: boolean;
    parse_status: string;
  };
  if (
    received.duplicate &&
    received.parse_status !== "pending" &&
    received.parse_status !== "failed"
  )
    return json(200, { ok: true, emailId: received.email_id, duplicate: true });

  try {
    const dispatched = await dispatchInboundEmail({
      emailId: received.email_id,
      providerEmailId: event.data.email_id,
      token,
      workspaceSlug: received.workspace_slug,
      from: event.data.from || null,
      subject: event.data.subject ?? null,
      receivedAt: event.data.created_at ?? event.created_at,
    });
    return json(200, { ok: true, emailId: received.email_id, mode: dispatched.mode });
  } catch (e) {
    console.error("h4a inbound processing failed", e instanceof Error ? e.message : e);
    // 500 → Resend retries the webhook; the email row already exists, so the retry resumes it.
    return json(500, { error: "Processing failed; will retry" });
  }
}
