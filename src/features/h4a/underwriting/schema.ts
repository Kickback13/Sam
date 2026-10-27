import { z } from "zod";

import { optionalDate, optionalNumber, optionalText, requiredText } from "@/lib/validation/common";

import { EMPTY_INPUTS, type UnderwritingInputs } from "./math";

const money = optionalNumber({ min: 0, max: 10_000_000_000 });
const pct = optionalNumber({ min: 0, max: 100 });

const unitMixRow = z.object({
  label: requiredText(40, "Name the unit type"),
  count: z.coerce.number().int("Whole units only").min(1, "At least 1").max(100_000),
  monthlyRent: z.coerce.number().min(0, "Can't be negative").max(1_000_000),
});

/** Validates calculator inputs from the form (strings ok) into UnderwritingInputs. */
export const underwritingInputsSchema = z.object({
  price: money,
  units: optionalNumber({ min: 0, max: 100_000, int: true }),
  buildingSqft: optionalNumber({ min: 0, max: 100_000_000, int: true }),
  unitMix: z.array(unitMixRow).max(50, "Up to 50 unit types").default([]),
  monthlyRentTotal: money,
  otherIncomeMonthly: money,
  vacancyPct: pct,
  expenseMode: z.enum(["itemized", "ratio"]).default("itemized"),
  taxRatePct: optionalNumber({ min: 0, max: 10 }),
  insurance: money,
  utilities: money,
  repairs: money,
  managementPct: pct,
  payroll: money,
  otherExpenses: money,
  expenseRatioPct: pct,
  ltvPct: pct,
  interestRatePct: optionalNumber({ min: 0, max: 30 }),
  amortYears: optionalNumber({ min: 1, max: 50 }),
  closingCosts: money,
}) satisfies z.ZodType<UnderwritingInputs, unknown>;

/** Reads stored jsonb back into inputs; anything unreadable falls back to empty (never invented). */
export function parseStoredInputs(value: unknown): UnderwritingInputs {
  const parsed = underwritingInputsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { ...EMPTY_INPUTS };
}

export const scenarioNameSchema = requiredText(120, "Name the scenario");

export const compInputSchema = z
  .object({
    kind: z.enum(["sale", "rent"]),
    address: requiredText(300, "Address is required"),
    city: optionalText(100),
    zip: optionalText(20),
    units: optionalNumber({ min: 1, max: 100_000, int: true }),
    building_sqft: optionalNumber({ min: 0, max: 100_000_000, int: true }),
    year_built: optionalNumber({ min: 1700, max: 2100, int: true }),
    price: optionalNumber({ min: 1, max: 10_000_000_000 }),
    sale_date: optionalDate,
    cap_rate: optionalNumber({ min: 0, max: 100 }),
    unit_type: optionalText(40),
    monthly_rent: optionalNumber({ min: 1, max: 1_000_000 }),
    distance_miles: optionalNumber({ min: 0, max: 9999 }),
    source_label: requiredText(200, "Say where this comp came from"),
    source_url: optionalText(2048).refine((v) => v === null || /^https?:\/\//i.test(v), {
      message: "Use a full link (https://…)",
    }),
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    notes: optionalText(2000),
  })
  .superRefine((c, ctx) => {
    if (c.kind === "sale" && c.price === null)
      ctx.addIssue({ code: "custom", path: ["price"], message: "A sale comp needs a price" });
    if (c.kind === "rent" && c.monthly_rent === null)
      ctx.addIssue({ code: "custom", path: ["monthly_rent"], message: "A rent comp needs a rent" });
  });

export type CompInput = z.output<typeof compInputSchema>;
