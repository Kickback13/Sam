import { z } from "zod";

/** Trimmed optional text; "" → null. */
export function optionalText(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const t = v.trim();
      return t === "" ? null : t;
    })
    .pipe(z.string().max(max, `Must be ${max} characters or fewer`).nullable());
}

export function requiredText(max: number, message = "Required") {
  return z.string().trim().min(1, message).max(max, `Must be ${max} characters or fewer`);
}

/** Number input that may arrive as a string from a form; "" → null. */
export function optionalNumber(opts: { min?: number; max?: number; int?: boolean } = {}) {
  let num = z.number({ error: "Enter a number" });
  if (opts.int) num = num.int("Enter a whole number");
  if (opts.min !== undefined) num = num.min(opts.min, `Must be at least ${opts.min}`);
  if (opts.max !== undefined) num = num.max(opts.max, `Must be at most ${opts.max}`);
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return null;
    if (typeof v === "string") {
      const cleaned = v.replace(/[$,\s]/g, "");
      return cleaned === "" ? null : Number(cleaned);
    }
    return v;
  }, num.nullable());
}

export const optionalUuid = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.uuid("Invalid id").nullable(),
);

export const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
);

export const optionalDateTime = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.iso.datetime({ offset: true, error: "Invalid date/time" }).nullable(),
);

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
