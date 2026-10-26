"use client";

import { CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { pasteEmail, type PasteOutcome } from "../server/actions/paste";

export type PasteSample = {
  key: string;
  label: string;
  from: string;
  subject: string;
  body: string;
};

/**
 * Runs the same parser pipeline as forwarded emails on pasted text or HTML.
 * Placeholder samples are offered only in the Demo workspace.
 */
export function PasteTool({ samples }: { samples: PasteSample[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [format, setFormat] = useState<"auto" | "text" | "html">("auto");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PasteOutcome | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <form
        noValidate
        className="space-y-4 rounded-xl border bg-card p-4 sm:p-6 lg:col-span-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setErrors({});
          setOutcome(null);
          start(async () => {
            const r = await pasteEmail({
              workspaceId: ws.id,
              workspaceSlug: ws.slug,
              from,
              subject,
              body,
              format,
            });
            if (!r.ok) {
              setError(r.error);
              setErrors(r.fieldErrors ?? {});
              return;
            }
            setOutcome(r.data);
            router.refresh();
          });
        }}
      >
        {samples.length > 0 && (
          <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
            <p className="flex items-center gap-1.5 font-semibold">
              <FlaskConical className="size-4" aria-hidden /> Demo workspace: load a placeholder
              email
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {samples.map((s) => (
                <Button
                  key={s.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFrom(s.from);
                    setSubject(s.subject);
                    setBody(s.body);
                    setFormat("auto");
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="paste-from"
            label="From (optional)"
            help="The marketplace or broker who sent it"
          >
            <Input
              id="paste-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="LoopNet <alerts@…>"
            />
          </Field>
          <Field id="paste-subject" label="Subject (optional)">
            <Input
              id="paste-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
        </div>
        <Field
          id="paste-body"
          label="Email text or HTML"
          required
          error={errors.body?.[0]}
          help="Paste the whole email — a forwarded one is fine. Links are recorded, never opened."
        >
          <Textarea
            id="paste-body"
            rows={14}
            className="font-mono text-xs"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={Boolean(errors.body)}
          />
        </Field>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field id="paste-format" label="Format">
            <NativeSelect
              id="paste-format"
              className="w-40"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="auto">Detect</option>
              <option value="text">Plain text</option>
              <option value="html">HTML</option>
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={!hydrated || pending} data-testid="run-parser">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Run parser
          </Button>
        </div>
      </form>

      <section aria-live="polite" className="space-y-3 lg:col-span-2" data-testid="paste-result">
        {!outcome ? (
          <div className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
            Results show here: which parser read the email, how confident it is, and the listings it
            created or updated (each one deduped and scored).
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> Parsed by{" "}
              {outcome.parserLabel}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {outcome.confidence && (
                <Badge variant="outline">Confidence: {outcome.confidence}</Badge>
              )}
              {outcome.formatStatus === "placeholder" && (
                <Badge variant="warning">Placeholder format</Badge>
              )}
              {outcome.formatStatus === "generic" && (
                <Badge variant="warning">Generic reader</Badge>
              )}
            </div>
            {outcome.confirmationCode && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Gmail forwarding confirmation code:{" "}
                <strong className="tabular">{outcome.confirmationCode}</strong>
              </p>
            )}
            {outcome.listings.length > 0 ? (
              <ul className="space-y-1 text-sm" data-testid="paste-listings">
                {outcome.listings.map((l, i) => (
                  <li key={i}>
                    {l.id ? (
                      <Link
                        href={`/w/${ws.slug}/deal-finder/${l.id}`}
                        className="font-semibold text-brand-accent-text hover:underline"
                      >
                        Listing {i + 1}:{" "}
                        {l.action === "created"
                          ? "added"
                          : l.action === "updated"
                            ? "updated"
                            : "already up to date"}
                      </Link>
                    ) : (
                      <span className="text-brand-danger">
                        Listing {i + 1} not saved: {l.error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">No listings found in this email.</p>
            )}
            {outcome.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {outcome.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
