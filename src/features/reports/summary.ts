/** Reports (ADR-038): the shape returned by public.report_summary, parsed defensively. */

export type WeekRow = {
  week: string;
  contacts: number;
  deals: number;
  calls: number;
  texts: number;
  meetings: number;
  notes: number;
  emails: number;
  listings: number;
  requests: number;
  bookings: number;
};

export type StageRow = {
  id: string;
  name: string;
  color: string;
  pipeline: string;
  is_won: boolean;
  is_lost: boolean;
  open_count: number;
  open_value: number;
};

export type ReportSummary = {
  days: number;
  since: string;
  generatedAt: string;
  weeks: WeekRow[];
  stages: StageRow[];
  closed: { won: number; won_value: number; lost: number };
  lostReasons: { reason: string; n: number }[];
  tasks: { done: number; open: number; overdue: number };
  listings: { received: number; promoted: number; dismissed: number; verified: number };
  alerts: number;
  bookings: {
    booked: number;
    completed: number;
    no_show: number;
    canceled: number;
    online: number;
  };
  requests: { office: string; status: string; n: number }[];
  estimates: {
    sent: number;
    sent_value: number;
    accepted: number;
    accepted_value: number;
    declined: number;
  };
  texts: { sent: number; received: number; blocked: number };
};

export const PERIODS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

export function parsePeriod(raw: string | undefined): number {
  const n = Number(raw);
  return PERIODS.some((p) => p.days === n) ? n : 90;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const nums = <K extends string>(v: unknown, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, num(obj(v)[k])])) as Record<K, number>;

export function parseSummary(raw: unknown): ReportSummary {
  const r = obj(raw);
  return {
    days: num(r.days),
    since: String(r.since ?? ""),
    generatedAt: String(r.generated_at ?? ""),
    weeks: arr(r.weeks).map((w) => ({
      week: String(obj(w).week ?? ""),
      ...nums(w, [
        "contacts",
        "deals",
        "calls",
        "texts",
        "meetings",
        "notes",
        "emails",
        "listings",
        "requests",
        "bookings",
      ] as const),
    })),
    stages: arr(r.stages).map((s) => {
      const o = obj(s);
      return {
        id: String(o.id ?? ""),
        name: String(o.name ?? ""),
        color: /^#[0-9a-f]{6}$/i.test(String(o.color)) ? String(o.color) : "#64748B",
        pipeline: String(o.pipeline ?? ""),
        is_won: Boolean(o.is_won),
        is_lost: Boolean(o.is_lost),
        open_count: num(o.open_count),
        open_value: num(o.open_value),
      };
    }),
    closed: nums(r.closed, ["won", "won_value", "lost"] as const),
    lostReasons: arr(r.lost_reasons).map((x) => ({
      reason: String(obj(x).reason ?? ""),
      n: num(obj(x).n),
    })),
    tasks: nums(r.tasks, ["done", "open", "overdue"] as const),
    listings: nums(r.listings, ["received", "promoted", "dismissed", "verified"] as const),
    alerts: num(r.alerts),
    bookings: nums(r.bookings, ["booked", "completed", "no_show", "canceled", "online"] as const),
    requests: arr(r.requests).map((x) => ({
      office: String(obj(x).office ?? ""),
      status: String(obj(x).status ?? ""),
      n: num(obj(x).n),
    })),
    estimates: nums(r.estimates, [
      "sent",
      "sent_value",
      "accepted",
      "accepted_value",
      "declined",
    ] as const),
    texts: nums(r.texts, ["sent", "received", "blocked"] as const),
  };
}

/** Win rate of closed deals (won / (won + lost)), or null when nothing closed. */
export function winRate(won: number, lost: number): number | null {
  return won + lost === 0 ? null : Math.round((won / (won + lost)) * 100);
}

export function sumWeeks(weeks: WeekRow[], key: keyof Omit<WeekRow, "week">): number {
  return weeks.reduce((t, w) => t + w[key], 0);
}
