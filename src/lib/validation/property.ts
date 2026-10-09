import { z } from "zod";

import { PROPERTY_TYPE_VALUES } from "@/lib/constants";

import { optionalDate, optionalNumber, optionalText, optionalUuid, requiredText, tagsSchema } from "./common";

export const propertyInputSchema = z.object({
  name: optionalText(200),
  address: requiredText(300, "Street address is required"),
  city: optionalText(100),
  state: z.string().trim().min(2).max(40).default("CA"),
  zip: optionalText(20),
  county: z.string().trim().min(1).max(60).default("San Diego"),
  apn: optionalText(40),
  lat: optionalNumber({ min: -90, max: 90 }),
  lng: optionalNumber({ min: -180, max: 180 }),
  property_type: z.preprocess((v) => (v === "" ? null : v), z.enum(PROPERTY_TYPE_VALUES).nullable().default(null)),
  units: optionalNumber({ min: 0, max: 100000, int: true }),
  buildings: optionalNumber({ min: 0, max: 10000, int: true }),
  building_sqft: optionalNumber({ min: 0, int: true }),
  lot_sqft: optionalNumber({ min: 0, int: true }),
  year_built: optionalNumber({ min: 1700, max: 2100, int: true }),
  zoning: optionalText(40),
  submarket: optionalText(100),
  owner_contact_id: optionalUuid,
  owner_company_id: optionalUuid,
  last_sale_date: optionalDate,
  last_sale_price: optionalNumber({ min: 0 }),
  assessed_value: optionalNumber({ min: 0 }),
  notes: optionalText(5000),
  tags: tagsSchema,
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type PropertyFormValues = z.input<typeof propertyInputSchema>;
