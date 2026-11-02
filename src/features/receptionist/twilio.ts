/**
 * Twilio voice: request-signature check and TwiML (the XML instructions Twilio
 * follows on a call). Server-only (node:crypto).
 *
 * Signature (X-Twilio-Signature): base64(HMAC-SHA1(auth token, full URL +
 * every POST field name and value, sorted by name, concatenated)).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** True when the signature matches any of the candidate URLs (proxies can change scheme/host). */
export function verifyTwilio(
  authToken: string,
  signature: string | null,
  urls: string[],
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const got = Buffer.from(signature);
  return urls.some((url) => {
    const want = Buffer.from(twilioSignature(authToken, url, params));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const doc = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

/** Ring a number for `seconds`, then Twilio posts the result to `action`. */
export function dialTwiml(
  number: string,
  seconds: number,
  action: string,
  callerId?: string | null,
): string {
  const cid = callerId ? ` callerId="${escapeXml(callerId)}"` : "";
  return doc(
    `<Dial timeout="${Math.round(seconds)}" action="${escapeXml(action)}" method="POST"${cid}><Number>${escapeXml(number)}</Number></Dial>`,
  );
}

/** Hand the call to the AI agent over SIP (ElevenLabs gives the SIP address). */
export function sipTwiml(sipUri: string, action: string): string {
  return doc(
    `<Dial action="${escapeXml(action)}" method="POST"><Sip>${escapeXml(sipUri)}</Sip></Dial>`,
  );
}

/** Greeting in English then Spanish, then record a message (max 2 minutes). */
export function voicemailTwiml(
  greetingEn: string,
  greetingEs: string | null,
  action: string,
): string {
  const es = greetingEs ? `<Say language="es-MX">${escapeXml(greetingEs)}</Say>` : "";
  return doc(
    `<Say language="en-US">${escapeXml(greetingEn)}</Say>${es}<Record maxLength="120" playBeep="true" action="${escapeXml(action)}" method="POST"/>`,
  );
}

export function sayAndHangupTwiml(text: string, language: "en-US" | "es-MX" = "en-US"): string {
  return doc(`<Say language="${language}">${escapeXml(text)}</Say><Hangup/>`);
}

export const hangupTwiml = () => doc("<Hangup/>");

export const DEFAULT_GREETING_EN =
  "Thanks for calling. We can't take your call right now. Please leave your name, number and a short message after the tone, and we'll call you back. This call may be recorded.";
export const DEFAULT_GREETING_ES =
  "Gracias por llamar. No podemos atender su llamada en este momento. Deje su nombre, número y un breve mensaje después del tono y le devolveremos la llamada. Esta llamada puede ser grabada.";

/** Twilio's DialCallStatus → did a person pick up? */
export function dialAnswered(status: string | undefined): boolean {
  return status === "completed" || status === "answered";
}

/** Final CallStatus → our outcome, when nothing better is known. */
export function callStatusOutcome(status: string | undefined): "missed" | null {
  return status && ["no-answer", "busy", "failed", "canceled"].includes(status) ? "missed" : null;
}
