/**
 * Receptionist routing rules. Pure (no I/O, no clock): the webhooks pass `now`.
 *
 *  - Business hours decide whether a call rings a person first or goes straight
 *    to the AI (after hours).
 *  - After the call, the transcript picks the route whose keywords match best
 *    (e.g. "repair", "tenant" → property management); no match → the default route.
 */

export type Route = {
  id: string;
  name: string;
  forward_to: string | null;
  keywords: string[];
  languages: string[];
  is_default: boolean;
};

export type Hours = Partial<Record<Day, [string, string][]>>;
export type Day = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Clean stored hours: keep only valid "HH:MM"–"HH:MM" ranges where start < end. */
export function parseHours(raw: unknown): Hours {
  const out: Hours = {};
  if (!raw || typeof raw !== "object") return out;
  for (const { key } of DAYS) {
    const ranges = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(ranges)) continue;
    const ok = ranges.filter(
      (r): r is [string, string] =>
        Array.isArray(r) &&
        r.length === 2 &&
        TIME.test(String(r[0])) &&
        TIME.test(String(r[1])) &&
        r[0] < r[1],
    );
    if (ok.length) out[key] = ok.slice(0, 4);
  }
  return out;
}

/** Day and "HH:MM" in a time zone. */
export function localDayTime(now: Date, timeZone: string): { day: Day; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as Day;
  return { day, time: `${get("hour").padStart(2, "0")}:${get("minute")}` };
}

/** Is `now` inside business hours? No hours set at all = always open. */
export function isOpen(hours: Hours, timeZone: string, now: Date): boolean {
  if (Object.keys(hours).length === 0) return true;
  const { day, time } = localDayTime(now, timeZone);
  return (hours[day] ?? []).some(([from, to]) => time >= from && time < to);
}

export function defaultRoute(routes: Route[]): Route | null {
  return routes.find((r) => r.is_default) ?? routes[0] ?? null;
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Best route for what the caller said: most keyword hits wins (ties → earlier
 * route); a route that doesn't serve the caller's language is skipped.
 */
export function chooseRoute(
  routes: Route[],
  text: string,
  language: "en" | "es" | null,
): Route | null {
  const haystack = ` ${normalize(text).replace(/[^a-z0-9]+/g, " ")} `;
  let best: { route: Route; hits: number } | null = null;
  for (const r of routes) {
    if (language && !r.languages.includes(language)) continue;
    const hits = r.keywords.filter((k) => {
      const kw = normalize(k)
        .trim()
        .replace(/[^a-z0-9]+/g, " ");
      return kw && haystack.includes(` ${kw} `);
    }).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { route: r, hits };
  }
  return best?.route ?? defaultRoute(routes);
}

const SPANISH =
  /\b(hola|gracias|buenos|buenas|por favor|necesito|quiero|tengo|usted|propiedad|casa|renta|alquiler|español)\b/;

/** Rough language guess from the caller's words when the provider doesn't say. */
export function detectLanguage(callerText: string): "en" | "es" | null {
  const t = normalize(callerText);
  if (!t.trim()) return null;
  return SPANISH.test(t) ? "es" : "en";
}
