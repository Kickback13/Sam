/**
 * GoHighLevel → platform mapping. Pure and unit-tested.
 *
 * Contacts become rows in the same shape as GHL's own CSV export, so they go
 * through the existing contact import (src/server/actions/imports.ts): same
 * validation, dedupe (GHL id, email, phone), merge and import report.
 *
 * Compliance: GHL "DND all channels" → DNC; Email DND → email opt-out; SMS DND →
 * the do-not-send list. SMS consent is never inferred — GHL has no consent
 * record, so every imported contact starts with "No SMS consent".
 */
import type { GhlContact, GhlOpportunity, GhlPipeline } from "./client";

/** Header → import field, using the headers GHL's CSV export uses. */
export const GHL_COLUMN_MAPPING = {
  "Contact Id": "ghl_contact_id",
  "First Name": "first_name",
  "Last Name": "last_name",
  Name: "full_name",
  Email: "email",
  "Additional Emails": "email_2",
  Phone: "phone",
  "Additional Phones": "phone_2",
  "Company Name": "company",
  "Street Address": "address",
  City: "city",
  State: "state",
  "Postal Code": "zip",
  Source: "source",
  Tags: "tags",
  DND: "dnc",
  "Email Unsubscribed": "email_opt_out",
} as const;

export type GhlRawRow = Partial<Record<keyof typeof GHL_COLUMN_MAPPING, string>>;

const MAX_CELL = 5000;
const cell = (v: unknown): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, MAX_CELL) : undefined;
};

/** GHL sends additional emails/phones as strings or objects ({ email } / { phone }). */
function extraValues(v: unknown, key: "email" | "phone"): string | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object"
          ? (x as Record<string, unknown>)[key]
          : null,
    )
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim());
  return out.length ? out.join(", ") : undefined;
}

const active = (c: GhlContact, channel: "Email" | "SMS") =>
  c.dndSettings?.[channel]?.status?.toLowerCase() === "active";

export function ghlContactToRow(c: GhlContact): GhlRawRow {
  const row: GhlRawRow = {
    "Contact Id": cell(c.id),
    "First Name": cell(c.firstName),
    "Last Name": cell(c.lastName),
    Email: cell(c.email),
    "Additional Emails": extraValues(c.additionalEmails, "email"),
    Phone: cell(c.phone),
    "Additional Phones": extraValues(c.additionalPhones, "phone"),
    "Company Name": cell(c.companyName),
    "Street Address": cell(c.address1),
    City: cell(c.city),
    State: cell(c.state),
    "Postal Code": cell(c.postalCode),
    Source: cell(c.source),
    Tags: Array.isArray(c.tags)
      ? cell(c.tags.filter((t) => typeof t === "string").join(", "))
      : undefined,
    DND: c.dnd ? "true" : "false",
    "Email Unsubscribed": active(c, "Email") ? "true" : "false",
  };
  if (!row["First Name"] && !row["Last Name"]) row.Name = cell(c.name);
  return row;
}

/** Phones whose texting is turned off in GHL (SMS DND or all-channel DND). */
export function smsBlockedPhones(c: GhlContact): string[] {
  if (!c.dnd && !active(c, "SMS")) return [];
  const extra = extraValues(c.additionalPhones, "phone");
  return [c.phone, ...(extra ? extra.split(", ") : [])].filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
}

// ---------------------------------------------------------------------------
// Opportunities → deals
// ---------------------------------------------------------------------------
export type LocalStage = {
  id: string;
  pipelineId: string;
  pipelineName: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
};

/** GHL stage id → local stage id. Built by the stage-mapping screen. */
export type StageMap = Record<string, string>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Default mapping: a GHL stage goes to the local stage with the same name
 * (case-insensitive) in the chosen pipeline, else that pipeline's first open stage.
 */
export function defaultStageMap(
  ghl: GhlPipeline[],
  local: LocalStage[],
  pipelineId: string,
): StageMap {
  const stages = local.filter((s) => s.pipelineId === pipelineId);
  const firstOpen = stages.find((s) => !s.isWon && !s.isLost) ?? stages[0];
  const out: StageMap = {};
  for (const p of ghl)
    for (const s of p.stages) {
      const same = stages.find((l) => norm(l.name) === norm(s.name));
      if (same ?? firstOpen) out[s.id] = (same ?? firstOpen).id;
    }
  return out;
}

export type DealPlan =
  | {
      action: "create";
      stageId: string;
      pipelineId: string;
      title: string;
      value: number | null;
      contactGhlId: string | null;
      source: string;
    }
  | { action: "skip"; reason: string };

/**
 * Where a GHL opportunity lands. Won/lost/abandoned follow the status (to the
 * pipeline's won / lost stage) whatever stage it sat in; open ones follow the map.
 */
export function planOpportunity(
  o: GhlOpportunity,
  stageMap: StageMap,
  local: LocalStage[],
): DealPlan {
  const status = (o.status ?? "open").toLowerCase();
  const mapped = o.pipelineStageId
    ? local.find((s) => s.id === stageMap[o.pipelineStageId!])
    : undefined;
  if (!mapped) return { action: "skip", reason: "Its GoHighLevel stage isn't mapped" };
  const pipelineStages = local.filter((s) => s.pipelineId === mapped.pipelineId);
  let stage = mapped;
  if (status === "won") stage = pipelineStages.find((s) => s.isWon) ?? mapped;
  else if (status === "lost" || status === "abandoned")
    stage = pipelineStages.find((s) => s.isLost) ?? mapped;
  const title = (o.name ?? "").trim().slice(0, 200) || "GoHighLevel opportunity";
  const value =
    typeof o.monetaryValue === "number" && Number.isFinite(o.monetaryValue) && o.monetaryValue >= 0
      ? Math.round(o.monetaryValue * 100) / 100
      : null;
  return {
    action: "create",
    stageId: stage.id,
    pipelineId: stage.pipelineId,
    title,
    value,
    contactGhlId: o.contactId ?? null,
    source: o.source ? `GoHighLevel: ${o.source}`.slice(0, 100) : "GoHighLevel",
  };
}
