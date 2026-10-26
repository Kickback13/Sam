import { z } from "zod";

import { PROPERTY_TYPE_VALUES } from "@/lib/constants";
import { normalizePhone } from "@/lib/normalize";
import {
  optionalEmail,
  optionalEnum,
  optionalNumber,
  optionalText,
  requiredText,
} from "@/lib/validation/common";

import { normalizeStreet } from "./normalize";

const maxYear = new Date().getFullYear() + 5;

const optionalZip = z
  .string()
  .trim()
  .regex(/^\d{5}(?:-\d{4})?$/, "Use a 5-digit ZIP")
  .nullish()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || /^https?:\/\/\S+$/i.test(v),
    "Use a full link starting with https://",
  );

const optionalPhone = optionalText(40).refine(
  (v) => v === null || normalizePhone(v) !== null,
  "Enter a valid phone number",
);

/** Every field a listing can carry. Used by manual entry, CSV rows and parsed emails. */
export const listingFieldsSchema = z.object({
  address: z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    requiredText(300, "Street address is required").refine(
      (v) => normalizeStreet(v) !== null,
      "Enter a street address",
    ),
  ),
  city: optionalText(100),
  state: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .nullish()
    .transform((v) => v || "CA"),
  zip: optionalZip,
  apn: optionalText(40),
  property_type: optionalEnum(PROPERTY_TYPE_VALUES),
  price: optionalNumber({ min: 0, max: 10_000_000_000 }),
  units: optionalNumber({ min: 0, max: 100000, int: true }),
  cap_rate: optionalNumber({ min: 0, max: 100 }),
  year_built: optionalNumber({ min: 1700, max: maxYear, int: true }),
  building_sqft: optionalNumber({ min: 0, max: 100_000_000, int: true }),
  lot_sqft: optionalNumber({ min: 0, max: 1_000_000_000, int: true }),
  submarket: optionalText(100),
  broker_name: optionalText(200),
  broker_company: optionalText(200),
  broker_phone: optionalPhone,
  broker_email: optionalEmail.transform((v) => (v ? v.toLowerCase() : null)),
  listing_url: optionalUrl,
});

export type ListingFields = z.infer<typeof listingFieldsSchema>;
export type ListingFieldsInput = z.input<typeof listingFieldsSchema>;

export const LISTING_FIELD_KEYS = Object.keys(listingFieldsSchema.shape) as (keyof ListingFields)[];

/** Fields shown with a source chip, in display order. */
export const SOURCED_LISTING_FIELDS = [
  { key: "price", label: "Price" },
  { key: "units", label: "Units" },
  { key: "cap_rate", label: "Cap rate" },
  { key: "property_type", label: "Property type" },
  { key: "year_built", label: "Year built" },
  { key: "building_sqft", label: "Building sq ft" },
  { key: "lot_sqft", label: "Lot sq ft" },
  { key: "apn", label: "APN" },
  { key: "submarket", label: "Submarket" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "zip", label: "ZIP" },
  { key: "broker_name", label: "Broker" },
  { key: "broker_company", label: "Brokerage" },
  { key: "broker_phone", label: "Broker phone" },
  { key: "broker_email", label: "Broker email" },
  { key: "listing_url", label: "Original listing" },
] as const;
