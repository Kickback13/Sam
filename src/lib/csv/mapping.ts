/**
 * CSV column mapping for contact imports. Aliases cover GoHighLevel's standard
 * contact export plus common CRM/spreadsheet headers.
 */

export const IMPORT_FIELDS = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "full_name", label: "Full name (split into first/last)" },
  { value: "email", label: "Email" },
  { value: "email_2", label: "Additional email(s)" },
  { value: "phone", label: "Phone (mobile)" },
  { value: "phone_2", label: "Additional phone(s)" },
  { value: "company", label: "Company name" },
  { value: "title", label: "Job title" },
  { value: "address", label: "Street address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "ZIP / postal code" },
  { value: "source", label: "Source" },
  { value: "tags", label: "Tags" },
  { value: "roles", label: "Roles" },
  { value: "notes", label: "Notes" },
  { value: "language", label: "Language" },
  { value: "dnc", label: "Do not contact (DNC/DND)" },
  { value: "email_opt_out", label: "Email unsubscribed" },
  { value: "ghl_contact_id", label: "GoHighLevel contact ID" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["value"];
export type ColumnMapping = Record<string, ImportField | "">;

const ALIASES: Record<ImportField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "contact first name"],
  last_name: ["last name", "lastname", "last", "surname", "family name", "contact last name"],
  full_name: ["name", "full name", "contact name", "contact", "fullname"],
  email: ["email", "e-mail", "email address", "primary email", "work email", "contact email"],
  email_2: [
    "additional emails",
    "additional email",
    "email 2",
    "secondary email",
    "other email",
    "personal email",
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile phone",
    "cell",
    "cell phone",
    "primary phone",
    "contact phone",
  ],
  phone_2: [
    "additional phones",
    "additional phone",
    "phone 2",
    "work phone",
    "office phone",
    "home phone",
    "landline",
  ],
  company: [
    "company",
    "company name",
    "business name",
    "organization",
    "organisation",
    "business",
    "brokerage",
  ],
  title: ["title", "job title", "position", "role title"],
  address: [
    "address",
    "street address",
    "address1",
    "address 1",
    "address line 1",
    "street",
    "mailing address",
  ],
  city: ["city", "town"],
  state: ["state", "province", "region", "state/province"],
  zip: ["zip", "zip code", "zipcode", "postal code", "postcode", "postal"],
  source: ["source", "lead source", "contact source"],
  tags: ["tags", "tag", "labels"],
  roles: ["roles", "contact type", "type", "role"],
  notes: ["notes", "note", "description", "comments"],
  language: ["language", "preferred language"],
  dnc: ["dnd", "do not disturb", "dnc", "do not call", "dnd all channels"],
  email_opt_out: ["unsubscribed", "email opt out", "email unsubscribed", "opted out", "email dnd"],
  ghl_contact_id: ["contact id", "ghl id", "ghl contact id", "highlevel id"],
};

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map each CSV header to a field. Each field is used at most once (first matching header wins). */
export function autoMap(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportField>();
  for (const header of headers) {
    const h = normalizeHeader(header);
    let match: ImportField | "" = "";
    for (const [field, aliases] of Object.entries(ALIASES) as [ImportField, string[]][]) {
      if (!used.has(field) && aliases.some((a) => normalizeHeader(a) === h)) {
        match = field;
        break;
      }
    }
    if (match) used.add(match);
    mapping[header] = match;
  }
  // A "Name" column is only needed when first/last are absent.
  const hasFirstOrLast = used.has("first_name") || used.has("last_name");
  if (hasFirstOrLast) {
    for (const [header, field] of Object.entries(mapping)) {
      if (field === "full_name") mapping[header] = "";
    }
  }
  return mapping;
}

export function mappedFields(mapping: ColumnMapping): Set<ImportField> {
  return new Set(Object.values(mapping).filter(Boolean) as ImportField[]);
}

/** A mapping is importable when it can identify a person. */
export function mappingProblems(mapping: ColumnMapping): string[] {
  const fields = mappedFields(mapping);
  const problems: string[] = [];
  const identifies = ["first_name", "last_name", "full_name", "email", "phone"].some((f) =>
    fields.has(f as ImportField),
  );
  if (!identifies)
    problems.push("Map at least one of: first name, last name, full name, email or phone.");
  const counts = new Map<string, number>();
  for (const f of Object.values(mapping)) if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts) {
    if (n > 1) problems.push(`"${f}" is mapped to ${n} columns — map it once.`);
  }
  return problems;
}
