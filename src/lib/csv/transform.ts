import { CONTACT_ROLE_VALUES, type ContactRole } from "@/lib/constants";
import { cleanText, normalizeEmail, normalizePhone, parseTags } from "@/lib/normalize";
import { contactInputSchema, type ContactInput } from "@/lib/validation/contact";

import type { ColumnMapping, ImportField } from "./mapping";

export type RawRow = Record<string, string | undefined>;

export type MappedRow = {
  contact: ContactInput;
  companyName: string | null;
  ghlContactId: string | null;
  emailKeys: string[];
  phoneKeys: string[];
};

export type TransformResult = { ok: true; value: MappedRow } | { ok: false; errors: string[] };

const ROLE_ALIASES: Record<string, ContactRole> = {
  owner: "owner",
  "property owner": "owner",
  landlord: "owner",
  broker: "broker",
  agent: "broker",
  realtor: "broker",
  "listing agent": "broker",
  "property manager": "property_manager",
  pm: "property_manager",
  manager: "property_manager",
  investor: "investor",
  buyer: "buyer",
  seller: "seller",
  lender: "lender",
  "loan officer": "lender",
  gc: "gc",
  "general contractor": "gc",
  contractor: "gc",
  sub: "subcontractor",
  subcontractor: "subcontractor",
  homeowner: "homeowner",
  tenant: "tenant",
  vendor: "vendor",
  supplier: "vendor",
};

function parseRoles(raw: string | null): ContactRole[] {
  if (!raw) return [];
  const out = new Set<ContactRole>();
  for (const part of raw.split(/[,;|/]/)) {
    const key = part.trim().toLowerCase().replace(/_/g, " ");
    if (!key) continue;
    const direct = (CONTACT_ROLE_VALUES as readonly string[]).includes(key.replace(/ /g, "_"))
      ? (key.replace(/ /g, "_") as ContactRole)
      : ROLE_ALIASES[key];
    if (direct) out.add(direct);
  }
  return [...out];
}

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  return ["true", "yes", "y", "1", "x", "dnd", "on"].includes(raw.trim().toLowerCase());
}

function parseLanguage(raw: string | null): "en" | "es" {
  if (!raw) return "en";
  const v = raw.trim().toLowerCase();
  return v.startsWith("es") || v.startsWith("span") ? "es" : "en";
}

function splitMulti(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function splitFullName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Pull the value of a mapped field out of a raw CSV row. */
function pick(row: RawRow, mapping: ColumnMapping, field: ImportField): string | null {
  for (const [header, target] of Object.entries(mapping)) {
    if (target === field) return cleanText(row[header]);
  }
  return null;
}

export function transformRow(row: RawRow, mapping: ColumnMapping, defaults: { source?: string } = {}): TransformResult {
  let first = pick(row, mapping, "first_name");
  let last = pick(row, mapping, "last_name");
  const full = pick(row, mapping, "full_name");
  if (!first && !last && full) ({ first, last } = splitFullName(full));

  const emailValues = [pick(row, mapping, "email"), ...splitMulti(pick(row, mapping, "email_2"))].filter(
    (v): v is string => Boolean(v),
  );
  const phoneValues = [pick(row, mapping, "phone"), ...splitMulti(pick(row, mapping, "phone_2"))].filter(
    (v): v is string => Boolean(v),
  );

  const errors: string[] = [];
  const emails: { value: string; label: string; is_primary: boolean }[] = [];
  const seenEmail = new Set<string>();
  for (const v of emailValues) {
    const key = normalizeEmail(v);
    if (!key) {
      errors.push(`Invalid email "${v}"`);
      continue;
    }
    if (seenEmail.has(key)) continue;
    seenEmail.add(key);
    emails.push({ value: key, label: emails.length === 0 ? "work" : "other", is_primary: emails.length === 0 });
  }

  const phones: { value: string; label: string; type: "mobile" | "landline" | "unknown"; is_primary: boolean }[] = [];
  const seenPhone = new Set<string>();
  for (const [i, v] of phoneValues.entries()) {
    const key = normalizePhone(v);
    if (!key) {
      errors.push(`Invalid phone "${v}"`);
      continue;
    }
    if (seenPhone.has(key)) continue;
    seenPhone.add(key);
    phones.push({
      value: v,
      label: i === 0 ? "mobile" : "other",
      type: i === 0 ? "mobile" : "unknown",
      is_primary: phones.length === 0,
    });
  }

  const parsed = contactInputSchema.safeParse({
    first_name: first,
    last_name: last,
    title: pick(row, mapping, "title"),
    roles: parseRoles(pick(row, mapping, "roles")),
    emails,
    phones,
    address: pick(row, mapping, "address"),
    city: pick(row, mapping, "city"),
    state: pick(row, mapping, "state"),
    zip: pick(row, mapping, "zip"),
    source: pick(row, mapping, "source") ?? defaults.source ?? "CSV import",
    tags: parseTags(pick(row, mapping, "tags")),
    language: parseLanguage(pick(row, mapping, "language")),
    dnc: parseBool(pick(row, mapping, "dnc")),
    email_opt_out: parseBool(pick(row, mapping, "email_opt_out")),
    sms_consent: "none",
    notes: pick(row, mapping, "notes"),
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "first_name" ? "name" : String(issue.path[0] ?? "row");
      errors.push(issue.path[0] === "first_name" ? issue.message : `${field}: ${issue.message}`);
    }
  }

  // Any unparseable email/phone fails the row (reported in the error file) rather than being silently dropped.
  if (!parsed.success || errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  if (emails.length === 0 && phones.length === 0 && !first && !last) {
    return { ok: false, errors: ["Row has no name, email or phone"] };
  }

  return {
    ok: true,
    value: {
      contact: parsed.data,
      companyName: pick(row, mapping, "company"),
      ghlContactId: pick(row, mapping, "ghl_contact_id"),
      emailKeys: [...seenEmail],
      phoneKeys: [...seenPhone],
    },
  };
}
