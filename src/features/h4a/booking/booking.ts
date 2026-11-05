/**
 * Booking page (Phase 4C, ADR-035): pure helpers shared by the public page, the staff
 * calendar and the private calendar feed. Open slots themselves are computed in the
 * database (`booking_open_slots`), the only authority on what the public may book.
 */

import { z } from "zod";

import { DAYS, parseHours, type Hours } from "@/features/receptionist/routing";

export { DAYS, parseHours, type Hours };

export const MEETING_LENGTHS = [15, 20, 30, 45, 60, 90] as const;
export const BOOKING_TIME_ZONES = [
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export const BOOKING_STATUSES = [
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled" },
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number]["value"];

export type Slot = { startsAt: string; endsAt: string };
export type SlotDay = { key: string; label: string; slots: (Slot & { label: string })[] };

/** Local calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function localDayKey(iso: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatSlotTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatSlotDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatSlotLong(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** Open slots grouped by local day, in order. */
export function groupSlotsByDay(slots: Slot[], timeZone: string): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const s of [...slots].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const key = localDayKey(s.startsAt, timeZone);
    let day = days.get(key);
    if (!day) {
      day = { key, label: formatSlotDay(s.startsAt, timeZone), slots: [] };
      days.set(key, day);
    }
    day.slots.push({ ...s, label: formatSlotTime(s.startsAt, timeZone) });
  }
  return [...days.values()];
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545): the lead's "add to calendar" file and Sam's private feed.
// ---------------------------------------------------------------------------
export type IcsEvent = {
  uid: string;
  start: string;
  end: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  status?: "CONFIRMED" | "CANCELLED";
  updated?: string | null;
};

const icsDate = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets (UTF-8 safe), continuation lines start with a space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], opts: { name: string; now?: Date }): string {
  const stamp = icsDate((opts.now ?? new Date()).toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Housing4All Platform//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(opts.name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${e.updated ? icsDate(e.updated) : stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    lines.push(`STATUS:${e.status ?? "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Validation (the database checks again; it is the authority).
// ---------------------------------------------------------------------------
const US_PHONE = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

export const publicBookingSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(60),
    startsAt: z.iso.datetime({ offset: true }),
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine((v) => v === "" || US_PHONE.test(v), "Enter a valid US phone number"),
    note: z.string().trim().max(2000, "Keep the note under 2,000 characters"),
    website: z.string().max(0).optional(), // honeypot: people never fill it
  })
  .refine((v) => v.email !== "" || v.phone !== "", {
    message: "Enter an email or a phone number so we can reach you",
    path: ["email"],
  });

export const bookingSettingsSchema = z.object({
  workspaceId: z.uuid(),
  enabled: z.boolean(),
  hostUserId: z.uuid().nullable(),
  title: z.string().trim().min(1, "Add a title").max(120),
  intro: z.string().trim().max(1000),
  location: z.string().trim().min(1, "Say where the call happens").max(200),
  meetingMinutes: z.coerce
    .number()
    .refine((n) => (MEETING_LENGTHS as readonly number[]).includes(n), "Pick a meeting length"),
  bufferMinutes: z.coerce.number().int().min(0).max(60),
  minNoticeHours: z.coerce.number().int().min(0).max(336),
  maxDaysAhead: z.coerce.number().int().min(1).max(90),
  timeZone: z.enum(BOOKING_TIME_ZONES),
  hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))),
});

export const blockSchema = z
  .object({
    workspaceId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    title: z.string().trim().max(200),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: "End after it starts",
    path: ["endsAt"],
  })
  .refine((v) => Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 24 * 3600 * 1000, {
    message: "Block at most a day at a time",
    path: ["endsAt"],
  });

/** "2026-11-05" + "09:30" in a time zone → ISO instant (handles DST). */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Offset of the zone at the guessed instant, then correct once (exact except in DST gaps).
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t).toISOString();
}
