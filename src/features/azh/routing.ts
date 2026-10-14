import type { Office } from "./constants";

/** First five digits of a ZIP ("92028-1234" → "92028"), or null. */
export function normalizeZip(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

/**
 * ZIP → office. Listed ZIPs go to their office; everything else (including a
 * blank or malformed ZIP) goes to San Diego. Mirrors app_private.azh_route_office.
 */
export function routeOffice(
  zip: string | null | undefined,
  routes: ReadonlyMap<string, Office> | Readonly<Record<string, Office>>,
): Office {
  const z = normalizeZip(zip);
  if (!z) return "san_diego";
  const office = routes instanceof Map ? routes.get(z) : (routes as Record<string, Office>)[z];
  return office ?? "san_diego";
}

/** Parse a pasted ZIP list ("92028, 92003\n92059") into unique, sorted 5-digit ZIPs + rejects. */
export function parseZipList(text: string): { zips: string[]; invalid: string[] } {
  const zips = new Set<string>();
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const t = token.trim();
    if (!t) continue;
    if (/^\d{5}$/.test(t)) zips.add(t);
    else invalid.push(t);
  }
  return { zips: [...zips].sort(), invalid };
}
