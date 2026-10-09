import { APP_TIMEZONE } from "@/lib/constants";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCurrency(value: number | string | null | undefined, opts?: { compact?: boolean }) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return (opts?.compact ? usdCompact : usd).format(n);
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return integer.format(value);
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Plain dates (YYYY-MM-DD) are calendar dates — anchor them at local noon so they never shift a day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00-08:00`);
  return new Date(value);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dateFmt.format(toDate(value));
}

export function formatShortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return shortDateFmt.format(toDate(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dateTimeFmt.format(toDate(value));
}

export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()) {
  if (!value) return "—";
  const date = toDate(value);
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(date);
}

/** End of "today" in the app timezone, as an ISO string (for due/overdue queries). */
export function endOfTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const offset = timezoneOffset(now);
  return new Date(`${parts}T23:59:59.999${offset}`).toISOString();
}

/** Today's calendar date (YYYY-MM-DD) in the app timezone. */
export function todayInAppTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function timezoneOffset(at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-07:00"
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-08:00";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
