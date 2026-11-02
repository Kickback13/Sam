import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { isProductionRuntime, siteUrl } from "@/features/h4a/server/config";
import { toJson } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

import { receptionistConfig } from "../config";
import { parsePostCall, verifyElevenLabs } from "../elevenlabs";
import {
  chooseRoute,
  defaultRoute,
  detectLanguage,
  isOpen,
  parseHours,
  type Route,
} from "../routing";
import {
  callStatusOutcome,
  DEFAULT_GREETING_EN,
  DEFAULT_GREETING_ES,
  dialAnswered,
  dialTwiml,
  hangupTwiml,
  sayAndHangupTwiml,
  sipTwiml,
  verifyTwilio,
  voicemailTwiml,
} from "../twilio";

/**
 * Phone-provider webhooks (no user session, no service-role key). Every call
 * presents the workspace's receptionist token from the URL (checked in the
 * database) AND the provider's signature (checked here). Unsigned requests are
 * refused on any production runtime.
 */
const TOKEN_RE = /^[0-9a-f]{32,128}$/;
const MAX_BODY = 512 * 1024;

function anonClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type Config = {
  workspace_name: string;
  enabled: boolean;
  ring_seconds: number;
  time_zone: string;
  hours: unknown;
  greeting_en: string | null;
  greeting_es: string | null;
  routes: Route[];
};

async function loadConfig(token: string): Promise<Config | null> {
  const { data, error } = await anonClient().rpc("receptionist_config", { p_token: token });
  if (error || !data) return null;
  return data as unknown as Config;
}

async function recordCall(token: string, call: Record<string, unknown>) {
  const { error } = await anonClient().rpc("receptionist_record_call", {
    p_token: token,
    p_call: toJson(call),
  });
  if (error)
    console.error("receptionist_record_call failed", { code: error.code, message: error.message });
}

const xml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** URLs Twilio may have signed (the public origin can differ from what the server sees). */
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

export type TwilioStep = "voice" | "after-dial" | "after-ai" | "voicemail" | "status";
export const TWILIO_STEPS: TwilioStep[] = [
  "voice",
  "after-dial",
  "after-ai",
  "voicemail",
  "status",
];

export async function handleTwilio(
  request: Request,
  token: string,
  step: TwilioStep,
): Promise<Response> {
  if (!TOKEN_RE.test(token)) return json(404, { error: "Not found" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "Payload too large" });
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const cfg = receptionistConfig();
  if (cfg.twilio.authToken) {
    if (
      !verifyTwilio(
        cfg.twilio.authToken,
        request.headers.get("x-twilio-signature"),
        candidateUrls(request),
        params,
      )
    )
      return json(401, { error: "Invalid signature" });
  } else if (isProductionRuntime()) {
    return json(503, { error: "Twilio is not connected (TWILIO_AUTH_TOKEN is not set)." });
  }

  const settings = await loadConfig(token);
  if (!settings) return json(404, { error: "Unknown receptionist" });
  const callSid = params.CallSid;
  if (!callSid) return json(400, { error: "CallSid missing" });
  const base = `/api/receptionist/twilio/${token}`;
  const routes = settings.routes ?? [];
  const first = defaultRoute(routes);
  const greetingEn = settings.greeting_en || DEFAULT_GREETING_EN;
  const greetingEs = settings.greeting_es || DEFAULT_GREETING_ES;
  const callBase = {
    provider: "twilio",
    provider_call_id: callSid,
    from_number: params.From,
    to_number: params.To,
  };

  // Unanswered: hand to the AI if it's connected, otherwise take a voicemail.
  const aiOrVoicemail = () =>
    cfg.aiSipUri && settings.enabled
      ? xml(sipTwiml(cfg.aiSipUri, `${base}/after-ai`))
      : xml(voicemailTwiml(greetingEn, greetingEs, `${base}/voicemail`));

  switch (step) {
    case "voice": {
      await recordCall(token, { ...callBase, outcome: "in_progress", route_id: first?.id });
      const open = isOpen(parseHours(settings.hours), settings.time_zone, new Date());
      // Ring the default route first during business hours (or always, when the AI is off).
      if (first?.forward_to && (open || !settings.enabled))
        return xml(
          dialTwiml(
            first.forward_to,
            settings.ring_seconds,
            `${base}/after-dial`,
            cfg.twilio.callerId,
          ),
        );
      return aiOrVoicemail();
    }
    case "after-dial": {
      if (dialAnswered(params.DialCallStatus)) {
        await recordCall(token, { ...callBase, outcome: "answered" });
        return xml(hangupTwiml());
      }
      return aiOrVoicemail();
    }
    case "after-ai": {
      if (dialAnswered(params.DialCallStatus)) {
        await recordCall(token, { ...callBase, outcome: "answered_by_ai" });
        return xml(hangupTwiml());
      }
      // The AI couldn't be reached: don't lose the caller.
      return xml(voicemailTwiml(greetingEn, greetingEs, `${base}/voicemail`));
    }
    case "voicemail": {
      const url = params.RecordingUrl?.startsWith("https://") ? params.RecordingUrl : null;
      await recordCall(token, {
        ...callBase,
        outcome: url ? "voicemail" : "missed",
        voicemail_url: url,
        duration_secs: params.RecordingDuration ? Number(params.RecordingDuration) : undefined,
        route_id: first?.id,
      });
      return xml(sayAndHangupTwiml("Thank you. Goodbye."));
    }
    case "status": {
      const outcome = callStatusOutcome(params.CallStatus);
      await recordCall(token, {
        ...callBase,
        ...(outcome ? { outcome, route_id: first?.id } : {}),
        duration_secs: params.CallDuration ? Number(params.CallDuration) : undefined,
        ended_at:
          params.CallStatus === "completed" || outcome ? new Date().toISOString() : undefined,
      });
      return new Response(null, { status: 204 });
    }
  }
}

/** ElevenLabs post-call webhook: transcript + summary, routed by what the caller said. */
export async function handleElevenLabs(request: Request, token: string): Promise<Response> {
  if (!TOKEN_RE.test(token)) return json(404, { error: "Not found" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "Payload too large" });
  const cfg = receptionistConfig();
  if (cfg.elevenlabs.webhookSecret) {
    if (
      !verifyElevenLabs(
        cfg.elevenlabs.webhookSecret,
        request.headers.get("elevenlabs-signature"),
        raw,
      )
    )
      return json(401, { error: "Invalid signature" });
  } else if (isProductionRuntime()) {
    return json(503, {
      error: "ElevenLabs is not connected (ELEVENLABS_WEBHOOK_SECRET is not set).",
    });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  const call = parsePostCall(payload);
  if (!call) return json(200, { ignored: "not a post-call transcription" });
  const settings = await loadConfig(token);
  if (!settings) return json(404, { error: "Unknown receptionist" });

  const language = call.language ?? detectLanguage(call.callerText);
  const route = chooseRoute(
    settings.routes ?? [],
    `${call.callerText} ${call.summary ?? ""}`,
    language,
  );
  await recordCall(token, {
    provider: call.provider,
    provider_call_id: call.providerCallId,
    from_number: call.fromNumber,
    to_number: call.toNumber,
    started_at: call.startedAt,
    duration_secs: call.durationSecs,
    language,
    outcome: "answered_by_ai",
    route_id: route?.id,
    caller_name: call.callerName,
    transcript: call.transcript,
    summary: call.summary,
    summary_source: call.summary ? "ElevenLabs" : null,
  });
  return json(200, { ok: true, route: route?.name ?? null });
}
