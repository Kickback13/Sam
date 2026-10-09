import { z } from "zod";

import { optionalDate, optionalNumber, optionalText, optionalUuid, requiredText } from "./common";

export const dealInputSchema = z.object({
  title: requiredText(200, "Give the deal a title"),
  pipeline_id: z.uuid(),
  stage_id: z.uuid(),
  property_id: optionalUuid,
  primary_contact_id: optionalUuid,
  value: optionalNumber({ min: 0 }),
  asking_price: optionalNumber({ min: 0 }),
  units: optionalNumber({ min: 0, int: true }),
  source: optionalText(100),
  assigned_to: optionalUuid,
  expected_close: optionalDate,
  notes: optionalText(5000),
});

export type DealInput = z.infer<typeof dealInputSchema>;
export type DealFormValues = z.input<typeof dealInputSchema>;

export const moveDealSchema = z.object({
  dealId: z.uuid(),
  stageId: z.uuid(),
  position: z.number().finite(),
  lostReason: optionalText(500),
});

export const dealContactSchema = z.object({
  dealId: z.uuid(),
  contactId: z.uuid(),
  role: optionalText(60),
});
