import { z } from "zod";

import { optionalDateTime, optionalEnum, optionalNumber, optionalText } from "./common";

export const SUBJECT_TYPES = ["contact", "company", "property", "deal"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** Types a person can log by hand (stage_change/system are written by the database). */
export const LOGGABLE_ACTIVITY_TYPES = ["note", "call", "meeting", "email", "sms"] as const;

export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
] as const;

export const activityInputSchema = z
  .object({
    workspaceId: z.uuid(),
    type: z.enum(LOGGABLE_ACTIVITY_TYPES),
    subject_type: z.enum(SUBJECT_TYPES),
    subject_id: z.uuid(),
    body: optionalText(20000),
    occurred_at: optionalDateTime,
    outcome: optionalEnum(["connected", "left_voicemail", "no_answer", "wrong_number"] as const),
    duration_minutes: optionalNumber({ min: 0, max: 600, int: true }),
  })
  .superRefine((a, ctx) => {
    if (a.type === "note" && !a.body) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Write the note first" });
    }
  });

export type ActivityInput = z.infer<typeof activityInputSchema>;
