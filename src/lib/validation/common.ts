import { z } from "zod";

/*
 * Zod 4 note: a key is optional only when its schema is optional/nullish/default.
 * preprocess() and unions are "required" wrappers, so every helper below ends in
 * `.optional().transform(v => v ?? null)` — missing, "" and null all become null.
 */

/** Trimmed optional text; missing/"" → null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v ? v : null));
}

export function requiredText(max: number, message = "Required") {
  return z.string().trim().min(1, message).max(max, `Must be ${max} characters or fewer`);
}

const blankToNull = (v: unknown) => (v === "" || (typeof v === "string" && v.trim() === "") ? null : v);

/** Number input that may arrive as a string from a form ("$1,200" ok); missing/"" → null. */
export function optionalNumber(opts: { min?: number; max?: number; int?: boolean } = {}) {
  let num = z.number({ error: "Enter a number" });
  if (opts.int) num = num.int("Enter a whole number");
  if (opts.min !== undefined) num = num.min(opts.min, `Must be at least ${opts.min}`);
  if (opts.max !== undefined) num = num.max(opts.max, `Must be at most ${opts.max}`);
  return z
    .preprocess((v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") {
        const cleaned = v.replace(/[$,\s]/g, "");
        return cleaned === "" ? null : Number(cleaned);
      }
      return v;
    }, num.nullable())
    .optional()
    .transform((v) => v ?? null);
}

export const optionalUuid = z
  .preprocess(blankToNull, z.uuid("Invalid id").nullable())
  .optional()
  .transform((v) => v ?? null);

export const optionalDate = z
  .preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable())
  .optional()
  .transform((v) => v ?? null);

export const optionalDateTime = z
  .preprocess(blankToNull, z.iso.datetime({ offset: true, error: "Invalid date/time" }).nullable())
  .optional()
  .transform((v) => v ?? null);

export function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .preprocess(blankToNull, z.enum(values).nullable())
    .optional()
    .transform((v) => v ?? null);
}

export const optionalEmail = z
  .preprocess(blankToNull, z.email("Enter a valid email").nullable())
  .optional()
  .transform((v) => v ?? null);

export const tagsSchema = z
  .array(z.string())
  .max(50)
  .default([])
  .transform((tags) => {
    const out = new Set<string>();
    for (const t of tags) {
      const tag = t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 50);
      if (tag) out.add(tag);
    }
    return [...out];
  });

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
