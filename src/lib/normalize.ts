/**
 * Contact normalization used for dedupe. Mirrors app_private.normalize_email /
 * normalize_phone in supabase/migrations/*_functions.sql — keep them in sync
 * (tests/unit/normalize.test.ts covers the shared cases).
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");
  return EMAIL_RE.test(value) ? value : null;
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const cleaned = String(raw)
    .trim()
    .replace(/\s*(ext\.?|extension|x|#)\s*\d+\s*$/i, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (cleaned.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}

/** "(619) 555-0100" for US numbers; otherwise the input unchanged. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = normalizePhone(raw);
  if (normalized && /^\+1\d{10}$/.test(normalized)) {
    const d = normalized.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

/** Collapse whitespace and trim; empty → null. */
export function cleanText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).replace(/\s+/g, " ").trim();
  return value === "" ? null : value;
}

/** Split a free-text tag list ("a, b; c") into unique lowercase tags. */
export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return uniqueTags(raw.map(String));
  if (typeof raw !== "string") return [];
  return uniqueTags(raw.split(/[,;|]/));
}

function uniqueTags(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const tag = v.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 50);
    if (tag) out.add(tag);
  }
  return [...out];
}
