import type { SequenceStep } from "./sequences";

/** Columns to select for a sequence step. */
export const STEP_COLUMNS = "position, channel, wait_days, subject, body, subject_es, body_es";

/** A stored step row as the app's step. */
export function stepFromRow(s: {
  position: number;
  channel: string;
  wait_days: number;
  subject: string | null;
  body: string;
  subject_es: string | null;
  body_es: string | null;
}): SequenceStep {
  return {
    position: s.position,
    channel: s.channel as "email" | "sms",
    waitDays: s.wait_days,
    subject: s.subject,
    body: s.body,
    subjectEs: s.subject_es,
    bodyEs: s.body_es,
  };
}
