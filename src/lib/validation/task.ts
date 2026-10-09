import { z } from "zod";

import { SUBJECT_TYPES } from "./activity";
import { optionalDateTime, optionalText, optionalUuid, requiredText } from "./common";

export const taskInputSchema = z
  .object({
    workspaceId: z.uuid(),
    title: requiredText(300, "What needs doing?"),
    notes: optionalText(5000),
    due_at: optionalDateTime,
    assigned_to: optionalUuid,
    related_type: z.preprocess((v) => (v === "" ? null : v), z.enum(SUBJECT_TYPES).nullable().default(null)),
    related_id: optionalUuid,
  })
  .refine((t) => (t.related_type === null) === (t.related_id === null), {
    path: ["related_id"],
    message: "Pick the related record",
  });

export type TaskInput = z.infer<typeof taskInputSchema>;
