/**
 * Twilio SMS (Phase 4D, ADR-036): send one text through Twilio's Messages API.
 * Server-only. Credentials come from env and are never stored in the database:
 *
 *   TWILIO_ACCOUNT_SID   "AC…" (Sam's Twilio account)
 *   TWILIO_AUTH_TOKEN    also verifies Twilio's webhooks (shared with the receptionist)
 *   TWILIO_API_BASE      optional override (tests point it at a local mock)
 *
 * Missing credentials ⇒ "Not connected": the composer explains and nothing is sent.
 */

export const TWILIO_API_BASE = "https://api.twilio.com";

export type SmsProviderConfig = {
  connected: boolean;
  accountSid: string | null;
  authToken: string | null;
  baseUrl: string;
};

export function smsProviderConfig(
  env: Record<string, string | undefined> = process.env,
): SmsProviderConfig {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() || null;
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() || null;
  const validSid = accountSid !== null && /^AC[0-9a-f]{32}$/.test(accountSid);
  return {
    connected: validSid && Boolean(authToken),
    accountSid: validSid ? accountSid : null,
    authToken,
    baseUrl: env.TWILIO_API_BASE?.trim() || TWILIO_API_BASE,
  };
}

export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type SendInput = {
  to: string;
  body: string;
  from?: string | null;
  messagingServiceSid?: string | null;
  statusCallback?: string | null;
};

/** One POST = one billable text. Callers run the compliance gates first. */
export async function sendTwilioSms(
  cfg: SmsProviderConfig,
  input: SendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sid: string; status: string }> {
  if (!cfg.connected || !cfg.accountSid || !cfg.authToken)
    throw new SmsSendError("Texting isn't connected (Twilio credentials missing).");
  if (!input.from && !input.messagingServiceSid)
    throw new SmsSendError("Set a sending number before texting.");
  const form = new URLSearchParams({ To: input.to, Body: input.body });
  if (input.messagingServiceSid) form.set("MessagingServiceSid", input.messagingServiceSid);
  else if (input.from) form.set("From", input.from);
  if (input.statusCallback) form.set("StatusCallback", input.statusCallback);
  const base = cfg.baseUrl.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchImpl(`${base}/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      cache: "no-store",
    });
  } catch {
    throw new SmsSendError("Couldn't reach Twilio. Try again in a minute.");
  }
  let json: { sid?: string; status?: string; message?: string; code?: number } = {};
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json.sid) {
    const why =
      res.status === 401
        ? "Twilio rejected the credentials"
        : json.message
          ? `Twilio: ${json.message.slice(0, 200)}`
          : `Twilio couldn't send it (${res.status})`;
    throw new SmsSendError(why, res.status);
  }
  return { sid: json.sid, status: json.status ?? "queued" };
}

export { smsSegments } from "./sms-segments";
