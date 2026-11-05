"use client";

import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Languages,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  SkipForward,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

import {
  mailtoLink,
  MERGE_FIELDS,
  missingFields,
  renderTemplate,
  stepForLanguage,
  type MergeVars,
  type MessageLanguage,
  type SequenceStep,
} from "../sequences";
import type { DueStep } from "../server/sequence-queries";
import {
  completeStep,
  deleteSequence,
  enrollContact,
  saveSequence,
  stopEnrollment,
} from "../server/sequences";

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
type DraftStep = {
  channel: "email" | "sms";
  waitDays: number;
  subject: string;
  body: string;
  subjectEs: string;
  bodyEs: string;
  /** Spanish fields shown (opened, or already filled in). */
  showEs: boolean;
};

export function SequenceEditor({
  initial,
}: {
  initial: {
    id: string | null;
    name: string;
    description: string;
    active: boolean;
    steps: SequenceStep[];
  };
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [active, setActive] = useState(initial.active);
  const [steps, setSteps] = useState<DraftStep[]>(
    initial.steps.map((s) => ({
      channel: s.channel,
      waitDays: s.waitDays,
      subject: s.subject ?? "",
      body: s.body,
      subjectEs: s.subjectEs ?? "",
      bodyEs: s.bodyEs ?? "",
      showEs: Boolean(s.bodyEs),
    })),
  );
  const readOnly = !ws.canWrite;
  const set = (i: number, patch: Partial<DraftStep>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <form
      className="space-y-4"
      data-testid="sequence-editor"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSequence({
            workspaceId: ws.id,
            sequenceId: initial.id,
            name,
            description,
            active,
            steps: steps.map((s) => ({
              channel: s.channel,
              waitDays: s.waitDays,
              body: s.body,
              subject: s.channel === "email" ? s.subject : null,
              bodyEs: s.bodyEs.trim() ? s.bodyEs : null,
              subjectEs: s.channel === "email" && s.bodyEs.trim() ? s.subjectEs : null,
            })),
          });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Sequence saved");
          if (!initial.id) router.push(`/w/${ws.slug}/outreach/sequences/${r.data.id}`);
          else router.refresh();
        });
      }}
    >
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <Field id="seq-name" label="Name">
          <Input
            id="seq-name"
            value={name}
            maxLength={120}
            disabled={readOnly}
            placeholder="e.g. New owner lead — 3 touches"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="seq-desc" label="What it's for (optional)">
          <Input
            id="seq-desc"
            value={description}
            maxLength={500}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-black"
            checked={active}
            disabled={readOnly}
            onChange={(e) => setActive(e.target.checked)}
            data-testid="seq-active"
          />
          Active (contacts can be added; steps come due for your team to send)
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        Fields you can use: {MERGE_FIELDS.map((f) => f.token).join(" ")}. Nothing is sent
        automatically: each step shows up under <strong>Due now</strong> for someone to send. Add a
        Spanish version to a step and contacts whose language is Spanish get it.
      </p>

      <ol className="space-y-3" data-testid="seq-steps">
        {steps.map((s, i) => (
          <li key={i} className="space-y-3 rounded-xl border bg-card p-4" data-testid="seq-step">
            <div className="flex flex-wrap items-end gap-3">
              <span className="pb-2 text-sm font-bold">Step {i + 1}</span>
              <Field id={`ch-${i}`} label="Channel">
                <NativeSelect
                  id={`ch-${i}`}
                  value={s.channel}
                  disabled={readOnly}
                  onChange={(e) => set(i, { channel: e.target.value as "email" | "sms" })}
                >
                  <option value="email">Email</option>
                  <option value="sms">Text</option>
                </NativeSelect>
              </Field>
              <Field id={`wait-${i}`} label={i === 0 ? "Days after adding" : "Days after previous"}>
                <Input
                  id={`wait-${i}`}
                  type="number"
                  min={0}
                  max={90}
                  className="w-24"
                  value={s.waitDays}
                  disabled={readOnly}
                  onChange={(e) => set(i, { waitDays: Number(e.target.value) })}
                />
              </Field>
              {!readOnly && (
                <div className="ml-auto flex gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove step"
                    onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </div>
            {s.channel === "email" && (
              <Field id={`subj-${i}`} label="Subject">
                <Input
                  id={`subj-${i}`}
                  value={s.subject}
                  maxLength={200}
                  disabled={readOnly}
                  onChange={(e) => set(i, { subject: e.target.value })}
                />
              </Field>
            )}
            <Field id={`body-${i}`} label="Message">
              <Textarea
                id={`body-${i}`}
                rows={s.channel === "sms" ? 3 : 6}
                maxLength={s.channel === "sms" ? 1600 : 5000}
                value={s.body}
                disabled={readOnly}
                onChange={(e) => set(i, { body: e.target.value })}
              />
            </Field>
            {s.showEs ? (
              <div
                className="space-y-3 rounded-lg border border-dashed p-3"
                lang="es"
                data-testid="seq-step-es"
              >
                <p className="text-xs font-semibold">Español (Spanish version, optional)</p>
                {s.channel === "email" && (
                  <Field id={`subj-es-${i}`} label="Asunto (subject)">
                    <Input
                      id={`subj-es-${i}`}
                      value={s.subjectEs}
                      maxLength={200}
                      disabled={readOnly}
                      placeholder="Leave blank to use the English subject"
                      onChange={(e) => set(i, { subjectEs: e.target.value })}
                    />
                  </Field>
                )}
                <Field id={`body-es-${i}`} label="Mensaje (message)">
                  <Textarea
                    id={`body-es-${i}`}
                    rows={s.channel === "sms" ? 3 : 6}
                    maxLength={s.channel === "sms" ? 1600 : 5000}
                    value={s.bodyEs}
                    disabled={readOnly}
                    onChange={(e) => set(i, { bodyEs: e.target.value })}
                  />
                </Field>
                {s.channel === "sms" && (
                  <p className="text-xs text-muted-foreground">
                    Tip: end texts with &quot;Responda ALTO para no recibir más mensajes.&quot;
                    ALTO, PARA, PARAR, CANCELAR and BAJA all opt the person out.
                  </p>
                )}
              </div>
            ) : (
              !readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => set(i, { showEs: true })}
                  data-testid="seq-add-es"
                >
                  <Languages aria-hidden /> Add Spanish version
                </Button>
              )
            )}
          </li>
        ))}
      </ol>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={steps.length >= 20}
            data-testid="seq-add-step"
            onClick={() =>
              setSteps((x) => [
                ...x,
                {
                  channel: x.length ? "sms" : "email",
                  waitDays: x.length ? 3 : 0,
                  subject: "",
                  body: "",
                  subjectEs: "",
                  bodyEs: "",
                  showEs: false,
                },
              ])
            }
          >
            <Plus aria-hidden /> Add step
          </Button>
          <Button type="submit" disabled={!hydrated || pending} data-testid="seq-save">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
          </Button>
          {initial.id && (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this sequence? Everyone in it stops getting its steps."))
                  return;
                start(async () => {
                  const r = await deleteSequence({ workspaceId: ws.id, sequenceId: initial.id! });
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success("Sequence deleted");
                    router.push(`/w/${ws.slug}/outreach/sequences`);
                  }
                });
              }}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Due now
// ---------------------------------------------------------------------------
export function DueQueue({
  items,
  myName,
  textingOff,
  showContact = true,
}: {
  items: DueStep[];
  myName: string | null;
  /** Why texting can't be used (null when it's on). */
  textingOff: string | null;
  showContact?: boolean;
}) {
  if (!items.length)
    return (
      <p
        className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
        data-testid="due-empty"
      >
        Nothing due right now.
      </p>
    );
  return (
    <ul className="space-y-3" data-testid="due-list">
      {items.map((d) => (
        <DueItem
          key={d.enrollmentId}
          d={d}
          myName={myName}
          textingOff={textingOff}
          showContact={showContact}
        />
      ))}
    </ul>
  );
}

function DueItem({
  d,
  myName,
  textingOff,
  showContact,
}: {
  d: DueStep;
  myName: string | null;
  textingOff: string | null;
  showContact: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const vars: MergeVars = { ...d.contact, my_name: myName };
  const [language, setLanguage] = useState<MessageLanguage>(
    stepForLanguage(d.step, d.contact.language).language,
  );
  const version = stepForLanguage(d.step, d.contact.language, language);
  const [subject, setSubject] = useState(renderTemplate(version.subject ?? "", vars));
  const [body, setBody] = useState(renderTemplate(version.body, vars));
  const [error, setError] = useState<string | null>(null);
  const missing = missingFields(`${version.subject ?? ""} ${version.body}`, vars);
  const switchTo = (l: MessageLanguage) => {
    const v = stepForLanguage(d.step, d.contact.language, l);
    setLanguage(v.language);
    setSubject(renderTemplate(v.subject ?? "", vars));
    setBody(renderTemplate(v.body, vars));
  };
  const isSms = d.step.channel === "sms";
  const emailBlocked =
    !isSms &&
    (d.contact.dnc
      ? "Marked do-not-contact"
      : d.contact.email_opt_out
        ? "Unsubscribed from email"
        : !d.contact.email
          ? "No email address"
          : null);

  const act = (action: "send_text" | "mark_emailed" | "skip", done: string) =>
    start(async () => {
      setError(null);
      const r = await completeStep({
        workspaceId: ws.id,
        enrollmentId: d.enrollmentId,
        action,
        body,
        subject,
        language,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.data.finished ? `${done} · sequence finished` : done);
      router.refresh();
    });

  return (
    <li
      className="space-y-2 rounded-xl border bg-card p-4"
      data-testid="due-item"
      data-channel={d.step.channel}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isSms ? (
          <MessageSquare className="size-4" aria-hidden />
        ) : (
          <Mail className="size-4" aria-hidden />
        )}
        {showContact && (
          <Link
            href={`/w/${ws.slug}/people/${d.contactId}`}
            className="font-semibold hover:underline"
          >
            {d.contact.full_name || "Contact"}
          </Link>
        )}
        <span className="text-muted-foreground">
          {d.sequenceName} · step {d.step.position} of {d.totalSteps} · {isSms ? "text" : "email"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground" title={formatDateTime(d.dueAt)}>
          due {formatRelative(d.dueAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="due-language">
        <span className="font-medium" lang={language}>
          {language === "es" ? "Español" : "English"}
        </span>
        {version.missingSpanish && (
          <span className="text-brand-danger" data-testid="due-no-spanish">
            Prefers Spanish, but this step has no Spanish version.
          </span>
        )}
        {version.hasSpanish && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => switchTo(language === "es" ? "en" : "es")}
            data-testid="due-switch-language"
          >
            <Languages aria-hidden />{" "}
            <span lang={language === "es" ? "en" : "es"}>
              {language === "es" ? "Use English" : "Usar español"}
            </span>
          </Button>
        )}
      </div>
      {missing.length > 0 && (
        <p className="text-xs font-medium text-brand-danger">
          No {missing.map((m) => m.replace("_", " ")).join(", ")} on file: check the message before
          sending.
        </p>
      )}
      {!isSms && (
        <Input
          aria-label="Subject"
          lang={language}
          value={subject}
          maxLength={200}
          onChange={(e) => setSubject(e.target.value)}
        />
      )}
      <Textarea
        aria-label="Message"
        lang={language}
        rows={isSms ? 3 : 6}
        value={body}
        maxLength={isSms ? 1600 : 5000}
        onChange={(e) => setBody(e.target.value)}
      />
      {isSms && textingOff && <p className="text-xs text-muted-foreground">Texts: {textingOff}</p>}
      {emailBlocked && <p className="text-xs text-muted-foreground">Email: {emailBlocked}</p>}
      {error && (
        <p role="status" className="text-sm font-medium text-brand-danger" data-testid="due-error">
          {error}
        </p>
      )}
      {ws.canWrite && (
        <div className="flex flex-wrap gap-2">
          {isSms ? (
            <Button
              size="sm"
              disabled={pending || Boolean(textingOff) || !body.trim()}
              onClick={() => act("send_text", "Text sent")}
              data-testid="due-send-text"
            >
              <MessageSquare aria-hidden /> Send text
            </Button>
          ) : (
            <>
              <Button
                asChild
                size="sm"
                variant="outline"
                aria-disabled={Boolean(emailBlocked)}
                className={emailBlocked ? "pointer-events-none opacity-50" : undefined}
              >
                <a
                  href={d.contact.email ? mailtoLink(d.contact.email, subject, body) : "#"}
                  data-testid="due-open-email"
                >
                  <Mail aria-hidden /> Open in my email
                </a>
              </Button>
              <Button
                size="sm"
                disabled={pending || Boolean(emailBlocked)}
                onClick={() => act("mark_emailed", "Marked as emailed")}
                data-testid="due-mark-emailed"
              >
                <Check aria-hidden /> I sent it
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act("skip", "Step skipped")}
            data-testid="due-skip"
          >
            <SkipForward aria-hidden /> Skip
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            data-testid="due-stop"
            onClick={() =>
              start(async () => {
                const r = await stopEnrollment({
                  workspaceId: ws.id,
                  enrollmentId: d.enrollmentId,
                });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Stopped for this contact");
                  router.refresh();
                }
              })
            }
          >
            <Ban aria-hidden /> Stop
          </Button>
          {pending && <Loader2 className="size-4 animate-spin self-center" aria-hidden />}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Contact page: add to a sequence
// ---------------------------------------------------------------------------
export function EnrollForm({
  contactId,
  sequences,
  dnc,
}: {
  contactId: string;
  sequences: { id: string; name: string }[];
  dnc: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [seq, setSeq] = useState(sequences[0]?.id ?? "");
  if (!ws.canWrite) return null;
  if (dnc)
    return (
      <p className="text-xs text-muted-foreground">
        Do-not-contact: can&apos;t be added to sequences.
      </p>
    );
  if (!sequences.length)
    return (
      <p className="text-xs text-muted-foreground">
        No active sequences.{" "}
        <Link href={`/w/${ws.slug}/outreach/sequences/new`} className="underline">
          Create one
        </Link>
        .
      </p>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="enroll-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await enrollContact({ workspaceId: ws.id, sequenceId: seq, contactId });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Added to sequence");
            router.refresh();
          }
        });
      }}
    >
      <NativeSelect
        aria-label="Sequence"
        value={seq}
        onChange={(e) => setSeq(e.target.value)}
        className="min-w-0 flex-1"
      >
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </NativeSelect>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending || !seq}
        data-testid="enroll-submit"
      >
        <Plus aria-hidden /> Add
      </Button>
    </form>
  );
}

export function EnrollmentStatus({
  status,
  stopReason,
}: {
  status: string;
  stopReason: string | null;
}) {
  if (status === "active") return <Badge variant="info">Active</Badge>;
  if (status === "finished") return <Badge variant="success">Finished</Badge>;
  return (
    <Badge variant="secondary" title={stopReason ?? undefined}>
      Stopped{stopReason ? `: ${stopReason}` : ""}
    </Badge>
  );
}

export function StopEnrollmentButton({ enrollmentId }: { enrollmentId: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await stopEnrollment({ workspaceId: ws.id, enrollmentId });
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      <Ban aria-hidden /> Stop
    </Button>
  );
}
