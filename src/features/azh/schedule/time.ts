import { APP_TIMEZONE } from "@/lib/constants";

/** "-07:00" style UTC offset of APP_TIMEZONE at a given instant. */
export function tzOffset(at: Date, timeZone = APP_TIMEZONE): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+00:00";
}

/**
 * Wall-clock date + time in the app timezone (San Diego) → UTC Date.
 * Resolves the offset at that local time, so DST transitions are handled.
 */
export function zonedDateTime(date: string, time: string, timeZone = APP_TIMEZONE): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const first = new Date(`${date}T${time}:00${tzOffset(guess, timeZone)}`);
  // Re-check with the offset at the resolved instant (matters right around a DST switch).
  return new Date(`${date}T${time}:00${tzOffset(first, timeZone)}`);
}

/** YYYY-MM-DD and HH:MM of an instant, in the app timezone. */
export function zonedParts(
  at: Date | string,
  timeZone = APP_TIMEZONE,
): { date: string; time: string } {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
