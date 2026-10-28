/**
 * Outreach compliance gates (Phase 4). Pure: no I/O, no clock, no env — the
 * caller passes `now` and the workspace settings, so every rule is unit-tested
 * (src/features/outreach/compliance.test.ts).
 *
 * Nothing may be sent to a contact unless the gate for that channel returns
 * `allowed: true`. The server re-runs the gate right before every send; a
 * result computed for a preview is never trusted at send time.
 *
 * Email (CAN-SPAM):   DNC · has an email · not opted out · not on the
 *                     suppression list · sender name + physical mailing
 *                     address set (the footer and unsubscribe link are always
 *                     added by renderNewsletter).
 * SMS (TCPA):         DNC · a mobile number · not STOPped (suppression list) ·
 *                     consent on file (written consent for marketing texts) ·
 *                     inside quiet hours in the recipient's time zone.
 */

export type Channel = "email" | "sms";
/** Marketing (newsletters, promotions) needs prior express WRITTEN consent for texts. */
export type Purpose = "marketing" | "informational";
export type SmsConsent = "none" | "express" | "written";

export type GateContact = {
  dnc: boolean;
  smsConsent: SmsConsent;
  smsConsentAt: string | null;
  emailOptOut: boolean;
  /** contacts.emails: [{ value, is_primary }] */
  emails: { value: string; is_primary?: boolean }[];
  /** contacts.phones: [{ value, type, is_primary }] */
  phones: { value: string; type?: string | null; is_primary?: boolean }[];
};

export type GateSettings = {
  senderName: string | null;
  mailingAddress: string | null;
  /** IANA zone used when the recipient's own zone isn't known. */
  timeZone: string;
  /** Texting window in local hours: from `sendFrom` (inclusive) to `sendUntil` (exclusive). */
  sendFrom: number;
  sendUntil: number;
};

export type Suppressions = {
  /** Normalized (lower-case) emails that unsubscribed or were suppressed. */
  emails: ReadonlySet<string>;
  /** Normalized (+1XXXXXXXXXX) phone numbers that texted STOP or were suppressed. */
  phones: ReadonlySet<string>;
};

export type BlockCode =
  | "dnc"
  | "no_email"
  | "email_opt_out"
  | "email_suppressed"
  | "no_sender"
  | "no_mailing_address"
  | "no_phone"
  | "landline"
  | "sms_stopped"
  | "no_sms_consent"
  | "needs_written_consent"
  | "quiet_hours";

export type Block = { code: BlockCode; message: string };

export type GateResult = {
  channel: Channel;
  allowed: boolean;
  /** The address/number the message would go to (primary first), when there is one. */
  to: string | null;
  blocks: Block[];
  warnings: string[];
  /** For quiet hours: the next moment a text may go out. */
  nextAllowedAt: Date | null;
};

export const DEFAULT_SEND_FROM = 8;
export const DEFAULT_SEND_UNTIL = 21;
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export const BLOCK_LABELS: Record<BlockCode, string> = {
  dnc: "Marked do-not-contact",
  no_email: "No email address",
  email_opt_out: "Unsubscribed from email",
  email_suppressed: "On the email suppression list",
  no_sender: "Sender name missing (Settings → Outreach)",
  no_mailing_address: "Mailing address missing (Settings → Outreach)",
  no_phone: "No phone number",
  landline: "Only a landline on file",
  sms_stopped: "Texted STOP",
  no_sms_consent: "No SMS consent on file",
  needs_written_consent: "Marketing texts need written consent",
  quiet_hours: "Outside texting hours",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeGateEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

/** Same rule as src/lib/normalize.ts normalizePhone for US numbers. */
export function normalizeGatePhone(raw: string): string | null {
  const digits = raw.replace(/\s*(ext\.?|extension|x|#)\s*\d+\s*$/i, "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function primaryFirst<T extends { is_primary?: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
}

const block = (code: BlockCode, message?: string): Block => ({
  code,
  message: message ?? BLOCK_LABELS[code],
});

/** CAN-SPAM + opt-out + DNC gate for one email. */
export function checkEmail(
  contact: GateContact,
  settings: GateSettings,
  suppressions: Suppressions,
): GateResult {
  const blocks: Block[] = [];
  const addresses = primaryFirst(contact.emails)
    .map((e) => normalizeGateEmail(e.value))
    .filter((v): v is string => v !== null);
  const to = addresses[0] ?? null;

  if (contact.dnc) blocks.push(block("dnc"));
  if (!to) blocks.push(block("no_email"));
  if (contact.emailOptOut) blocks.push(block("email_opt_out"));
  else if (to && suppressions.emails.has(to)) blocks.push(block("email_suppressed"));
  if (!settings.senderName?.trim()) blocks.push(block("no_sender"));
  if (!settings.mailingAddress?.trim()) blocks.push(block("no_mailing_address"));

  return {
    channel: "email",
    allowed: blocks.length === 0,
    to,
    blocks,
    warnings: [],
    nextAllowedAt: null,
  };
}

/** Hour (0–23) and minute in `timeZone` at `now`. */
export function localTime(now: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute") };
}

/**
 * Is `now` inside the texting window [sendFrom, sendUntil) in `timeZone`?
 * If not, also returns the next allowed moment (start of the window).
 */
export function quietHours(
  now: Date,
  timeZone: string,
  sendFrom: number,
  sendUntil: number,
): { inWindow: boolean; nextAllowedAt: Date | null } {
  const { hour, minute } = localTime(now, timeZone);
  const inWindow = hour >= sendFrom && hour < sendUntil;
  if (inWindow) return { inWindow, nextAllowedAt: null };
  // Minutes until the window opens (today if before it, otherwise tomorrow).
  const nowMin = hour * 60 + minute;
  const openMin = sendFrom * 60;
  const wait = nowMin < openMin ? openMin - nowMin : 24 * 60 - nowMin + openMin;
  const next = new Date(now.getTime() + wait * 60_000);
  next.setUTCSeconds(0, 0);
  return { inWindow, nextAllowedAt: next };
}

/** TCPA gate for one text message. */
export function checkSms(
  contact: GateContact,
  settings: GateSettings,
  suppressions: Suppressions,
  purpose: Purpose,
  now: Date,
): GateResult {
  const blocks: Block[] = [];
  const warnings: string[] = [];
  const phones = primaryFirst(contact.phones)
    .map((p) => ({ number: normalizeGatePhone(p.value), type: p.type ?? "unknown" }))
    .filter((p): p is { number: string; type: string } => p.number !== null);
  const textable = phones.filter((p) => p.type !== "landline");
  const target = textable.find((p) => p.type === "mobile") ?? textable[0] ?? null;
  const to = target?.number ?? null;

  if (contact.dnc) blocks.push(block("dnc"));
  if (phones.length === 0) blocks.push(block("no_phone"));
  else if (!target) blocks.push(block("landline"));
  else if (target.type !== "mobile")
    warnings.push("Phone type unknown — confirm it's a mobile number before texting.");

  // A STOP on any of the contact's numbers blocks texting the contact at all.
  if (phones.some((p) => suppressions.phones.has(p.number))) blocks.push(block("sms_stopped"));

  if (contact.smsConsent === "none" || !contact.smsConsentAt) blocks.push(block("no_sms_consent"));
  else if (purpose === "marketing" && contact.smsConsent !== "written")
    blocks.push(block("needs_written_consent"));

  const q = quietHours(now, settings.timeZone, settings.sendFrom, settings.sendUntil);
  if (!q.inWindow)
    blocks.push(
      block(
        "quiet_hours",
        `Outside texting hours (${formatHour(settings.sendFrom)}–${formatHour(settings.sendUntil)} ${shortZone(settings.timeZone)})`,
      ),
    );

  return {
    channel: "sms",
    allowed: blocks.length === 0,
    to,
    blocks,
    warnings,
    nextAllowedAt: q.nextAllowedAt,
  };
}

export function formatHour(h: number): string {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function shortZone(timeZone: string): string {
  return timeZone === DEFAULT_TIME_ZONE ? "Pacific" : timeZone;
}

/**
 * Inbound text keywords (CTIA / TCPA). Matched on the whole message, trimmed
 * and case-insensitive, so "Stop" opts out but "don't stop the deal" doesn't.
 */
const STOP_WORDS = [
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "REVOKE",
  "OPTOUT",
  "OPT OUT",
];
const START_WORDS = ["START", "UNSTOP"];
const HELP_WORDS = ["HELP", "INFO"];

export type InboundKeyword = "stop" | "start" | "help" | null;

export function classifyInboundSms(body: string): InboundKeyword {
  const word = body
    .trim()
    .replace(/[.!?\s]+$/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (STOP_WORDS.includes(word)) return "stop";
  if (START_WORDS.includes(word)) return "start";
  if (HELP_WORDS.includes(word)) return "help";
  return null;
}

/** Count how many contacts each block code stops (one contact can hit several). */
export function summarizeBlocks(results: GateResult[]): {
  allowed: number;
  blocked: number;
  byCode: Partial<Record<BlockCode, number>>;
} {
  const byCode: Partial<Record<BlockCode, number>> = {};
  let allowed = 0;
  for (const r of results) {
    if (r.allowed) allowed += 1;
    for (const b of r.blocks) byCode[b.code] = (byCode[b.code] ?? 0) + 1;
  }
  return { allowed, blocked: results.length - allowed, byCode };
}
