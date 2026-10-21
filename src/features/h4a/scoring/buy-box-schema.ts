import { z } from "zod";

import { PROPERTY_TYPE_VALUES } from "@/lib/constants";
import { optionalNumber, optionalText } from "@/lib/validation/common";

/** "92104, 92105 92116" → ["92104","92105","92116"] (also accepts arrays). */
export function splitList(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(/[,;\n]+/)
      : [];
  const out = new Map<string, string>();
  for (const p of parts) {
    const v = p.replace(/\s+/g, " ").trim();
    if (v) out.set(v.toLowerCase(), v);
  }
  return [...out.values()];
}

const zipList = z.preprocess(
  (v) => splitList(v).flatMap((s) => s.split(" ")),
  z.array(z.string().regex(/^\d{5}$/, "ZIPs are 5 digits (e.g. 92104)")).max(300, "Up to 300 ZIPs"),
);
const nameList = (what: string) =>
  z.preprocess(
    (v) => splitList(v),
    z
      .array(z.string().min(1).max(100, `${what} names are up to 100 characters`))
      .max(100, `Up to 100 ${what.toLowerCase()}s`),
  );

const year = new Date().getFullYear() + 5;

export const buyBoxInputSchema = z
  .object({
    zips: zipList,
    cities: nameList("City"),
    submarkets: nameList("Submarket"),
    property_types: z.array(z.enum(PROPERTY_TYPE_VALUES)).max(8).default([]),
    units_min: optionalNumber({ min: 0, max: 100000, int: true }),
    units_max: optionalNumber({ min: 0, max: 100000, int: true }),
    price_min: optionalNumber({ min: 0, max: 10_000_000_000 }),
    price_max: optionalNumber({ min: 0, max: 10_000_000_000 }),
    max_price_per_unit: optionalNumber({ min: 0, max: 1_000_000_000 }),
    year_built_min: optionalNumber({ min: 1700, max: year, int: true }),
    year_built_max: optionalNumber({ min: 1700, max: year, int: true }),
    notes: optionalText(5000),
    alert_threshold: z.coerce.number().int().min(0).max(100).default(70),
  })
  .superRefine((b, ctx) => {
    const pairs: [keyof typeof b, keyof typeof b, string][] = [
      ["units_min", "units_max", "Units"],
      ["price_min", "price_max", "Price"],
      ["year_built_min", "year_built_max", "Year built"],
    ];
    for (const [lo, hi, label] of pairs) {
      const a = b[lo] as number | null;
      const c = b[hi] as number | null;
      if (a !== null && c !== null && a > c)
        ctx.addIssue({
          code: "custom",
          path: [hi],
          message: `${label}: the max must be at least the min`,
        });
    }
  });

export type BuyBoxInput = z.infer<typeof buyBoxInputSchema>;
export type BuyBoxFormValues = z.input<typeof buyBoxInputSchema>;
