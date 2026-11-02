/**
 * ElevenLabs Conversational AI post-call webhook: signature check + mapping to
 * a receptionist call. Server-only (node:crypto).
 *
 * Signature header `ElevenLabs-Signature: t=<unix secs>,v0=<hex>` where
 * hex = HMAC-SHA256(webhook secret, "<t>.<raw body>"). Older than 30 minutes → refused.
 * The payload is parsed defensively: only the fields we use are read.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ELEVENLABS_TOLERANCE_SECONDS = 30 * 60;

export function elevenLabsSignature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyElevenLabs(
  secret: string,
  header: string | null,
  body: string,
  now: Date = new Date(),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v0 = parts.v0;
  if (!t || !v0 || !/^\d+$/.test(t)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(t)) > ELEVENLABS_TOLERANCE_SECONDS) return false;
  const want = Buffer.from(elevenLabsSignature(secret, t, body));
  const got = Buffer.from(v0);
  return want.length === got.length && timingSafeEqual(want, got);
}

export type TranscriptTurn = { role: "agent" | "caller"; text: string; at_secs: number | null };

export type ParsedPostCall = {
  provider: "twilio" | "elevenlabs";
  providerCallId: string;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;
  durationSecs: number | null;
  transcript: TranscriptTurn[];
  callerText: string;
  summary: string | null;
  callerName: string | null;
  language: "en" | "es" | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Map a post_call_transcription event; null for other event types or unusable payloads. */
export function parsePostCall(payload: unknown): ParsedPostCall | null {
  const p = payload as { type?: unknown; data?: Record<string, unknown> };
  if (p?.type !== "post_call_transcription" || !p.data || typeof p.data !== "object") return null;
  const d = p.data;
  const conversationId = str(d.conversation_id);
  if (!conversationId) return null;
  const meta = (d.metadata ?? {}) as Record<string, unknown>;
  const phone = (meta.phone_call ?? {}) as Record<string, unknown>;
  const analysis = (d.analysis ?? {}) as Record<string, unknown>;
  const collected = (analysis.data_collection_results ?? {}) as Record<string, { value?: unknown }>;

  const transcript: TranscriptTurn[] = (Array.isArray(d.transcript) ? d.transcript : [])
    .map((t: Record<string, unknown>) => ({
      role: (t?.role === "agent" ? "agent" : "caller") as TranscriptTurn["role"],
      text: (str(t?.message) ?? "").slice(0, 4000),
      at_secs: num(t?.time_in_call_secs),
    }))
    .filter((t) => t.text)
    .slice(0, 500);

  const lang = str(meta.main_language) ?? str((d as Record<string, unknown>).language);
  const start = num(meta.start_time_unix_secs);
  const callSid = str(phone.call_sid);
  const callerName = str(collected.caller_name?.value);

  return {
    // When ElevenLabs answered a Twilio call, key it by the Twilio call SID so both merge.
    provider: callSid ? "twilio" : "elevenlabs",
    providerCallId: callSid ?? conversationId,
    fromNumber: str(phone.external_number),
    toNumber: str(phone.agent_number),
    startedAt: start ? new Date(start * 1000).toISOString() : null,
    durationSecs: num(meta.call_duration_secs),
    transcript,
    callerText: transcript
      .filter((t) => t.role === "caller")
      .map((t) => t.text)
      .join(" "),
    summary: str(analysis.transcript_summary)?.slice(0, 5000) ?? null,
    callerName: callerName ? callerName.slice(0, 120) : null,
    language: lang?.startsWith("es") ? "es" : lang?.startsWith("en") ? "en" : null,
  };
}
