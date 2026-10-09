import { z } from "zod";

import { COMPANY_TYPE_VALUES } from "@/lib/constants";

import { optionalEmail, optionalEnum, optionalText, requiredText, tagsSchema } from "./common";

export const companyInputSchema = z.object({
  name: requiredText(200, "Company name is required"),
  type: optionalEnum(COMPANY_TYPE_VALUES),
  website: optionalText(500),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(300),
  city: optionalText(100),
  state: optionalText(40),
  zip: optionalText(20),
  notes: optionalText(5000),
  tags: tagsSchema,
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
export type CompanyFormValues = z.input<typeof companyInputSchema>;
