/**
 * Follow-up sequences (Phase 4E, ADR-039). Pure: message fill-in and step scheduling.
 * Steps come due for a person to send; nothing is sent automatically.
 */

export type SequenceStep = {
  position: number;
  channel: "email" | "sms";
  waitDays: number;
  subject: string | null;
  body: string;
  /** Optional Spanish version (ADR-043), used for contacts whose language is "es". */
  subjectEs?: string | null;
  bodyEs?: string | null;
};

export type MessageLanguage = "en" | "es";

/**
 * The version of a step to show for a contact. Spanish contacts get the Spanish text
 * when the step has one; otherwise English, flagged so the person can see it.
 */
export function stepForLanguage(
  step: SequenceStep,
  contactLanguage: string | null | undefined,
  override?: MessageLanguage,
): {
  language: MessageLanguage;
  subject: string | null;
  body: string;
  /** The contact prefers Spanish but this step has no Spanish version. */
  missingSpanish: boolean;
  hasSpanish: boolean;
} {
  const hasSpanish = Boolean(step.bodyEs?.trim());
  const wantsSpanish = contactLanguage === "es";
  const language: MessageLanguage =
    override === "en" ? "en" : (override === "es" || wantsSpanish) && hasSpanish ? "es" : "en";
  const es = language === "es";
  return {
    language,
    subject: es ? step.subjectEs?.trim() || step.subject : step.subject,
    body: es ? step.bodyEs!.trim() : step.body,
    missingSpanish: wantsSpanish && !hasSpanish,
    hasSpanish,
  };
}

export const MERGE_FIELDS = [
  { token: "{first_name}", label: "First name" },
  { token: "{last_name}", label: "Last name" },
  { token: "{full_name}", label: "Full name" },
  { token: "{company}", label: "Company" },
  { token: "{my_name}", label: "Your name" },
] as const;

export type MergeVars = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company?: string | null;
  my_name?: string | null;
};

/** Fill {fields}; a field with no value becomes empty (and the gap is tidied). Unknown {tokens} stay. */
export function renderTemplate(text: string, vars: MergeVars): string {
  const out = text.replace(
    /\{(first_name|last_name|full_name|company|my_name)\}/g,
    (_, k: keyof MergeVars) => (vars[k] ?? "").trim(),
  );
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

/** Fields used in a template that this contact has no value for (to warn before sending). */
export function missingFields(text: string, vars: MergeVars): string[] {
  const used = [...text.matchAll(/\{(first_name|last_name|full_name|company|my_name)\}/g)].map(
    (m) => m[1] as keyof MergeVars,
  );
  return [...new Set(used.filter((k) => !(vars[k] ?? "").trim()))];
}

const DAY = 86_400_000;

/** When the first step is due for a new enrollment. */
export function firstDue(
  steps: SequenceStep[],
  now: Date,
): { position: number; dueAt: Date } | null {
  const first = [...steps].sort((a, b) => a.position - b.position)[0];
  return first
    ? { position: first.position, dueAt: new Date(now.getTime() + first.waitDays * DAY) }
    : null;
}

/** After step `done` is sent or skipped: the next step and when it's due, or finished. */
export function advance(
  steps: SequenceStep[],
  done: number,
  now: Date,
): { finished: true } | { finished: false; position: number; dueAt: Date } {
  const next = [...steps].sort((a, b) => a.position - b.position).find((s) => s.position > done);
  if (!next) return { finished: true };
  return {
    finished: false,
    position: next.position,
    dueAt: new Date(now.getTime() + next.waitDays * DAY),
  };
}

/** Steps as saved: renumbered 1..n in the given order, trimmed, emails keep a subject. */
export function normalizeSteps(steps: SequenceStep[]): SequenceStep[] {
  return steps.map((s, i) => ({
    position: i + 1,
    channel: s.channel,
    waitDays: Math.max(0, Math.min(90, Math.round(s.waitDays))),
    subject: s.channel === "email" ? (s.subject ?? "").trim() || null : null,
    body: s.body.trim(),
    subjectEs:
      s.channel === "email" && (s.bodyEs ?? "").trim() ? (s.subjectEs ?? "").trim() || null : null,
    bodyEs: (s.bodyEs ?? "").trim() || null,
  }));
}

/** A mailto: link for an email step (opens the person's own mail app). */
export function mailtoLink(to: string, subject: string | null, body: string): string {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  q.set("body", body);
  return `mailto:${encodeURIComponent(to)}?${q.toString().replace(/\+/g, "%20")}`;
}
