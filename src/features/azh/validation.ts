import { z } from "zod";

import {
  optionalDate,
  optionalEnum,
  optionalNumber,
  optionalText,
  optionalUuid,
  requiredText,
} from "@/lib/validation/common";

import {
  CHANGE_ORDER_STATUS_VALUES,
  ESTIMATE_STATUS_VALUES,
  MILESTONE_STATUS_VALUES,
  OFFICE_VALUES,
  REQUEST_STATUS_VALUES,
  VISIT_STATUS_VALUES,
} from "./constants";

const zip = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : v),
    z
      .string()
      .regex(/^\d{5}$/, "Use a 5-digit ZIP")
      .nullable(),
  )
  .optional()
  .transform((v) => v ?? null);

const money = (max = 100_000_000) => optionalNumber({ min: 0, max });

/** Trimmed, de-duplicated list of short labels. */
export function labelList(maxItems: number, maxLen = 60) {
  return z
    .array(z.string())
    .max(maxItems, `At most ${maxItems}`)
    .transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of list) {
        const v = raw.trim().replace(/\s+/g, " ").slice(0, maxLen);
        const key = v.toLowerCase();
        if (v && !seen.has(key)) {
          seen.add(key);
          out.push(v);
        }
      }
      return out;
    });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projectSchema = z.object({
  job_address: optionalText(300),
  job_zip: zip,
  property_id: optionalUuid,
  service_types: labelList(20),
  office: optionalEnum(OFFICE_VALUES),
  source: optionalText(100),
  contract_value: money(),
  bid_sent_on: optionalDate,
  start_on: optionalDate,
  target_on: optionalDate,
  completed_on: optionalDate,
  project_lead: optionalUuid,
  notes: optionalText(20000),
});
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectFormValues = z.input<typeof projectSchema>;

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------
export const estimateItemSchema = z.object({
  description: requiredText(500, "Describe the line"),
  qty: optionalNumber({ min: 0, max: 1_000_000 }).transform((v) => v ?? 1),
  unit: optionalText(20),
  unit_price: money().transform((v) => v ?? 0),
});

export const estimateSchema = z.object({
  title: requiredText(200, "Give the estimate a title"),
  markup_pct: optionalNumber({ min: 0, max: 100 }).transform((v) => v ?? 0),
  tax_pct: optionalNumber({ min: 0, max: 100 }).transform((v) => v ?? 0),
  valid_until: optionalDate,
  notes: optionalText(5000),
  items: z.array(estimateItemSchema).max(200, "At most 200 lines"),
});
export type EstimateInput = z.infer<typeof estimateSchema>;
export type EstimateFormValues = z.input<typeof estimateSchema>;

export const estimateStatusSchema = z.enum(ESTIMATE_STATUS_VALUES);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const assigneeList = z
  .array(z.uuid("Invalid member"))
  .max(20, "At most 20 people per office")
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const azhSettingsSchema = z.object({
  cslb_license: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim().replace(/^#/, "") || null : v),
      z
        .string()
        .regex(/^[0-9A-Za-z-]{1,20}$/, "Letters, digits and dashes only (max 20)")
        .nullable(),
    )
    .optional()
    .transform((v) => v ?? null),
  service_types: labelList(40).refine((l) => l.length > 0, "Keep at least one service type"),
  intake_enabled: z.boolean(),
  /** Members who get a task for every new request, in order (the first owns the request). */
  san_diego_assignees: assigneeList,
  fallbrook_assignees: assigneeList,
});
export type AzhSettingsInput = z.infer<typeof azhSettingsSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export const requestUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUS_VALUES).optional(),
  office: z.enum(OFFICE_VALUES).optional(),
  assigned_to: optionalUuid.optional(),
});

export const callLogSchema = z.object({
  body: requiredText(5000, "Add a short note about the call"),
  outcome: z.enum(["reached", "voicemail", "no_answer"]),
});

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------
export const visitSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
    duration_min: z.coerce
      .number({ error: "Pick a length" })
      .int()
      .min(15, "At least 15 minutes")
      .max(720, "At most 12 hours"),
    office: z.enum(OFFICE_VALUES),
    estimator_id: optionalUuid,
    address: optionalText(300),
    notes: optionalText(2000),
    request_id: optionalUuid,
    deal_id: optionalUuid,
  })
  .refine((v) => v.request_id || v.deal_id, {
    message: "A visit belongs to a request or a project",
    path: ["request_id"],
  });
export type VisitInput = z.infer<typeof visitSchema>;
export type VisitFormValues = z.input<typeof visitSchema>;

export const visitStatusSchema = z.enum(VISIT_STATUS_VALUES);

// ---------------------------------------------------------------------------
// Milestones + budget
// ---------------------------------------------------------------------------
export const milestoneSchema = z.object({
  name: requiredText(200, "Name the milestone"),
  planned_on: optionalDate,
  status: z.enum(MILESTONE_STATUS_VALUES).default("planned"),
  notes: optionalText(2000),
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;

export const budgetLineSchema = z.object({
  category: requiredText(60, "Name the category"),
  budgeted: money().transform((v) => v ?? 0),
});

export const costSchema = z.object({
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  vendor: optionalText(120),
  amount: optionalNumber({ min: 0, max: 100_000_000 }).refine((v) => v !== null, "Enter an amount"),
  category: requiredText(60, "Pick a category"),
  receipt_file_id: optionalUuid,
  notes: optionalText(1000),
});

export const changeOrderSchema = z.object({
  description: requiredText(1000, "Describe the change"),
  amount: optionalNumber({ min: -100_000_000, max: 100_000_000 }).refine(
    (v) => v !== null,
    "Enter an amount (negative for a credit)",
  ),
  status: z.enum(CHANGE_ORDER_STATUS_VALUES).default("pending"),
});
