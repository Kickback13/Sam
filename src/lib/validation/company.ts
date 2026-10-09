import { z } from "zod";

import { COMPANY_TYPE_VALUES } from "@/lib/constants";

import { optionalText, requiredText, tagsSchema } from "./common";

export const companyInputSchema = z.object({
  name: requiredText(200, "Company name is required"),
  type: z.preprocess((v) => (v === "" ? null : v), z.enum(COMPANY_TYPE_VALUES).nullable().default(null)),
  website: optionalText(500),
  phone: optionalText(40),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email("Enter a valid email").nullable().default(null),
  ),
  address: optionalText(300),
  city: optionalText(100),
  state: optionalText(40),
  zip: optionalText(20),
  notes: optionalText(5000),
  tags: tagsSchema,
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
export type CompanyFormValues = z.input<typeof companyInputSchema>;
