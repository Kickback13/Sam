import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { isProductionRuntime, siteUrl } from "@/features/h4a/server/config";
import { escapeXml, verifyTwilio } from "@/features/receptionist/twilio";
import type { Database } from "@/lib/db/types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

import { smsProviderConfig } from "../sms-provider";

const TOKEN_RE = /^[0-9a-f]{48}$/;
const MAX_BODY = 64 * 1024;

function anonClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const twiml = (inner = "") =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function candidateUrls(request: Request): string[] {
  const url = new URL(request.url);
  const out = new Set([request.url]);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  if (host) out.add(`${proto}://${host}${url.pathname}${url.search}`);
  const site = siteUrl();
  if (site) out.add(`${site}${url.pathname}${url.search}`);
  return [...out];
}

/** Parse the form body and check Twilio's signature. Returns the params or an error response. */
async function verified(
  request: Request,
): Promise<{ params: Record<string, string> } | { response: Response }> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { response: json(413, { error: "Payload too large" }) };
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const { authToken } = smsProviderConfig();
  if (authToken) {
    if (
      !verifyTwilio(
        authToken,
        request.headers.get("x-twilio-signature"),
        candidateUrls(request),
        params,
      )
    )
      return { response: json(401, { error: "Invalid signature" }) };
  } else if (isProductionRuntime()) {
    return {
      response: json(503, { error: "Twilio is not connected (TWILIO_AUTH_TOKEN is not set)." }),
    };
  }
  return { params };
}

/** POST /api/sms/inbound/{token}: a text to Sam's Twilio number. */
export async function handleInboundSms(request: Request, token: string): Promise<Response> {
  if (!TOKEN_RE.test(token)) return json(404, { error: "Not found" });
  const v = await verified(request);
  if ("response" in v) return v.response;
  const { From, To, Body, MessageSid } = v.params;
  const { data, error } = await anonClient().rpc("sms_receive", {
    p_token: token,
    p_from: From ?? "",
    p_to: To ?? "",
    p_body: Body ?? "",
    p_sid: MessageSid ?? "",
  });
  if (error) {
    if (error.code === "42501") return json(404, { error: "Unknown webhook" });
    if (error.code === "22023") return json(400, { error: error.message });
    console.error("sms_receive failed", { code: error.code });
    return json(500, { error: "Could not record the message" });
  }
  const row = data?.[0];
  // STOP/START replies are sent by Twilio itself (Advanced Opt-Out); we only answer HELP.
  if (row?.keyword === "help" && row.help_reply)
    return twiml(`<Message>${escapeXml(row.help_reply)}</Message>`);
  return twiml();
}

/** POST /api/sms/status: Twilio's delivery status for a text we sent. */
export async function handleSmsStatus(request: Request): Promise<Response> {
  const v = await verified(request);
  if ("response" in v) return v.response;
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = v.params;
  const { error } = await anonClient().rpc("sms_status", {
    p_sid: MessageSid ?? "",
    p_status: MessageStatus ?? "",
    p_error: [ErrorCode && `Error ${ErrorCode}`, ErrorMessage].filter(Boolean).join(": "),
  });
  if (error) {
    console.error("sms_status failed", { code: error.code });
    return json(500, { error: "Could not record the status" });
  }
  return new Response(null, { status: 204 });
}
