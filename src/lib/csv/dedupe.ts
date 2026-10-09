import { normalizeEmail, normalizePhone } from "@/lib/normalize";

/**
 * Dedupe planning for imports. A row matches an existing contact (or an earlier
 * row in the same file) when any normalized email, normalized phone or
 * GoHighLevel contact ID is shared.
 */

export type DedupeKeys = {
  emailKeys: string[];
  phoneKeys: string[];
  ghlContactId?: string | null;
};

export type ExistingContact = DedupeKeys & { id: string; full_name?: string | null };

export type RowPlan =
  | { action: "create" }
  | { action: "match"; existingId: string; existingName: string | null; via: string }
  | { action: "duplicate_in_file"; firstRow: number; via: string };

function keysOf(k: DedupeKeys): string[] {
  return [
    ...k.emailKeys.map((e) => `e:${e}`),
    ...k.phoneKeys.map((p) => `p:${p}`),
    ...(k.ghlContactId ? [`g:${k.ghlContactId}`] : []),
  ];
}

function describe(key: string): string {
  const [kind, value] = [key.slice(0, 1), key.slice(2)];
  if (kind === "e") return `email ${value}`;
  if (kind === "p") return `phone ${value}`;
  return `GHL ID ${value}`;
}

export function buildExistingIndex(existing: ExistingContact[]): Map<string, ExistingContact> {
  const index = new Map<string, ExistingContact>();
  for (const c of existing) for (const key of keysOf(c)) if (!index.has(key)) index.set(key, c);
  return index;
}

/** Plan each row in order. `rows` carry their 1-based CSV row numbers. */
export function planRows(
  rows: (DedupeKeys & { row: number })[],
  existing: ExistingContact[],
): Map<number, RowPlan> {
  const index = buildExistingIndex(existing);
  const seenInFile = new Map<string, number>();
  const plans = new Map<number, RowPlan>();

  for (const row of rows) {
    const keys = keysOf(row);
    const existingKey = keys.find((k) => index.has(k));
    if (existingKey) {
      const match = index.get(existingKey)!;
      plans.set(row.row, {
        action: "match",
        existingId: match.id,
        existingName: match.full_name ?? null,
        via: describe(existingKey),
      });
    } else {
      const fileKey = keys.find((k) => seenInFile.has(k));
      if (fileKey) {
        plans.set(row.row, { action: "duplicate_in_file", firstRow: seenInFile.get(fileKey)!, via: describe(fileKey) });
      } else {
        plans.set(row.row, { action: "create" });
      }
    }
    for (const k of keys) if (!seenInFile.has(k)) seenInFile.set(k, row.row);
  }
  return plans;
}

/** Merge an incoming contact into an existing one ("update" strategy): non-empty incoming values win, lists union. */
export function mergeContact<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") continue;
    const prev = existing[key];
    if (Array.isArray(value)) {
      if (key === "emails" || key === "phones") {
        type Entry = { value: string; is_primary?: boolean };
        const norm = key === "emails" ? normalizeEmail : normalizePhone;
        const prevList = (Array.isArray(prev) ? prev : []) as Entry[];
        const seen = new Set(prevList.map((e) => norm(e.value) ?? e.value));
        const merged: Entry[] = [...prevList];
        for (const entry of value as Entry[]) {
          const k = norm(entry.value) ?? entry.value;
          if (!seen.has(k)) {
            merged.push({ ...entry, is_primary: merged.length === 0 });
            seen.add(k);
          }
        }
        out[key] = merged;
      } else {
        out[key] = [...new Set([...(Array.isArray(prev) ? (prev as unknown[]) : []), ...(value as unknown[])])];
      }
    } else if (typeof value === "boolean") {
      // Compliance flags only ever tighten on import (never clear an existing DNC/opt-out).
      out[key] = Boolean(prev) || value;
    } else {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}

/** CSV-safe cell (prevents spreadsheet formula injection in the error report). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}
