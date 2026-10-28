"use client";

import { Copy, Eye, Loader2, Save, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_ROLES } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { BLOCK_LABELS, type BlockCode } from "../compliance";
import { defaultReason, renderNewsletter } from "../render";
import type { Audience } from "../schema";
import {
  copyNewsletter,
  deleteNewsletter,
  saveNewsletter,
  sendNewsletter,
} from "../server/actions";

export type AudienceCheck = {
  matched: number;
  sendable: number;
  duplicates: number;
  byCode: Partial<Record<BlockCode, number>>;
  blockedSample: { contactId: string; name: string; email: string | null; reasons: BlockCode[] }[];
};

type Draft = { subject: string; preheader: string; body: string; tags: string; roles: string[] };

export function NewsletterEditor({
  newsletter,
  footer,
  check,
  email,
  copyTargets,
}: {
  newsletter: {
    id: string;
    subject: string;
    preheader: string | null;
    body: string;
    audience: Audience;
  };
  footer: { senderName: string | null; mailingAddress: string | null; workspaceName: string };
  check: AudienceCheck;
  email: { enabled: boolean; reason: string | null };
  copyTargets: { id: string; name: string; slug: string }[];
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const readOnly = !ws.canWrite;
  const [pending, start] = useTransition();
  const initial: Draft = {
    subject: newsletter.subject,
    preheader: newsletter.preheader ?? "",
    body: newsletter.body,
    tags: newsletter.audience.tags.join(", "),
    roles: newsletter.audience.roles,
  };
  const [d, setD] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [copyTo, setCopyTo] = useState(copyTargets[0]?.id ?? "");
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const err = (k: string) => errors[k]?.[0];

  const preview = useMemo(
    () =>
      renderNewsletter(
        { subject: d.subject, preheader: d.preheader, body: d.body },
        {
          senderName: footer.senderName ?? "[Sender name — Settings → Outreach]",
          mailingAddress: footer.mailingAddress ?? "[Mailing address — Settings → Outreach]",
          reason: defaultReason(footer.workspaceName),
          unsubscribeUrl: null,
        },
      ),
    [d.subject, d.preheader, d.body, footer],
  );

  const values = () => ({
    subject: d.subject,
    preheader: d.preheader,
    body: d.body,
    audience: {
      tags: d.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      roles: d.roles,
    },
  });

  const save = () =>
    start(async () => {
      setErrors({});
      setFormError(null);
      const r = await saveNewsletter({ workspaceId: ws.id, id: newsletter.id, values: values() });
      if (!r.ok) {
        setFormError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      setSaved(d);
      toast.success("Newsletter saved");
      router.refresh();
    });

  const sendDisabledReason = !email.enabled
    ? "Email isn't connected, so Send is off."
    : dirty
      ? "Save your changes first."
      : check.sendable === 0
        ? "No one in this audience passes the checks."
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <form
          noValidate
          className="space-y-4 rounded-xl border bg-card p-4"
          data-testid="newsletter-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) save();
          }}
        >
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {formError}
            </p>
          )}
          <Field id="nl-subject" label="Subject line" error={err("subject")} required>
            <Input
              id="nl-subject"
              value={d.subject}
              maxLength={200}
              onChange={(e) => setD((s) => ({ ...s, subject: e.target.value }))}
              aria-invalid={Boolean(err("subject"))}
              disabled={readOnly}
            />
          </Field>
          <Field
            id="nl-preheader"
            label="Preview text"
            error={err("preheader")}
            help="The grey line inboxes show after the subject. Optional."
          >
            <Input
              id="nl-preheader"
              value={d.preheader}
              maxLength={200}
              onChange={(e) => setD((s) => ({ ...s, preheader: e.target.value }))}
              disabled={readOnly}
            />
          </Field>
          <Field
            id="nl-body"
            label="Message"
            error={err("body")}
            help={
              <>
                <code># Heading</code> · <code>## Subheading</code> · <code>- bullet</code> ·{" "}
                <code>**bold**</code> · <code>[link text](https://…)</code> · blank line = new
                paragraph. The footer with your address and unsubscribe link is added automatically.
              </>
            }
          >
            <Textarea
              id="nl-body"
              rows={14}
              value={d.body}
              onChange={(e) => setD((s) => ({ ...s, body: e.target.value }))}
              aria-invalid={Boolean(err("body"))}
              disabled={readOnly}
              className="font-mono text-sm"
            />
          </Field>
          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-bold">Audience</legend>
            <p className="text-xs text-muted-foreground">
              Leave both empty to include every contact. Otherwise contacts need any of the tags{" "}
              <em>and</em> any of the roles.
            </p>
            <Field
              id="nl-tags"
              label="Tags"
              error={err("audience.tags")}
              help="Separate with commas, e.g. investor, newsletter."
            >
              <Input
                id="nl-tags"
                value={d.tags}
                onChange={(e) => setD((s) => ({ ...s, tags: e.target.value }))}
                disabled={readOnly}
              />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium" id="nl-roles-label">
                Roles
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="nl-roles-label">
                {CONTACT_ROLES.map((r) => {
                  const checked = d.roles.includes(r.value);
                  return (
                    <label
                      key={r.value}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-brand-ink has-[:checked]:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-black"
                        checked={checked}
                        disabled={readOnly}
                        onChange={() =>
                          setD((s) => ({
                            ...s,
                            roles: checked
                              ? s.roles.filter((x) => x !== r.value)
                              : [...s.roles, r.value],
                          }))
                        }
                      />
                      {r.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && (
                <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>
              )}
              <Button
                type="submit"
                disabled={!hydrated || pending || !dirty}
                data-testid="save-newsletter"
              >
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                Save draft
              </Button>
            </div>
          )}
        </form>

        <section
          className="space-y-3 rounded-xl border bg-card p-4"
          data-testid="audience-check"
          aria-labelledby="ac-h"
        >
          <h2 id="ac-h" className="flex items-center gap-2 font-sans text-base font-bold">
            {check.sendable > 0 ? (
              <ShieldCheck className="size-4 text-emerald-700" aria-hidden />
            ) : (
              <ShieldAlert className="size-4 text-amber-700" aria-hidden />
            )}
            Audience check
          </h2>
          <p className="text-sm">
            <span className="font-semibold" data-testid="ac-sendable">
              {formatNumber(check.sendable)}
            </span>{" "}
            of {formatNumber(check.matched)} matching contacts would get this email
            {check.duplicates > 0
              ? ` (${formatNumber(check.duplicates)} share an address and get one copy)`
              : ""}
            .{dirty && <span className="text-muted-foreground"> Save to update.</span>}
          </p>
          {Object.keys(check.byCode).length > 0 && (
            <ul className="space-y-1 text-sm" data-testid="ac-blocked">
              {(Object.entries(check.byCode) as [BlockCode, number][]).map(([code, n]) => (
                <li key={code} className="flex justify-between gap-2" data-code={code}>
                  <span>{BLOCK_LABELS[code]}</span>
                  <span className="font-semibold tabular">{formatNumber(n)}</span>
                </li>
              ))}
            </ul>
          )}
          {check.blockedSample.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Who is blocked and why</summary>
              <ul className="mt-2 space-y-1">
                {check.blockedSample.map((b) => (
                  <li key={b.contactId}>
                    <Link
                      href={`/w/${ws.slug}/people/${b.contactId}`}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {b.email ?? "no email"} — {b.reasons.map((r) => BLOCK_LABELS[r]).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!readOnly && (
            <div className="space-y-2 border-t pt-3">
              <Button
                type="button"
                disabled={!hydrated || pending || sendDisabledReason !== null}
                data-testid="send-newsletter"
                onClick={() => {
                  if (
                    !confirm(
                      `Send "${d.subject}" to ${check.sendable} contacts now? This can't be undone.`,
                    )
                  )
                    return;
                  start(async () => {
                    const r = await sendNewsletter({ workspaceId: ws.id, id: newsletter.id });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success(
                      `Sent to ${r.data.sent} · ${r.data.blocked} blocked${r.data.failed ? ` · ${r.data.failed} failed` : ""}`,
                    );
                    router.refresh();
                  });
                }}
              >
                <Send aria-hidden /> Send to {formatNumber(check.sendable)}
              </Button>
              {sendDisabledReason && (
                <p className="text-xs text-muted-foreground" data-testid="send-disabled-reason">
                  {sendDisabledReason}
                  {!email.enabled && email.reason ? ` ${email.reason}` : ""}
                </p>
              )}
            </div>
          )}
        </section>

        {!readOnly && (
          <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="more-h">
            <h2 id="more-h" className="font-sans text-base font-bold">
              More
            </h2>
            {copyTargets.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <Field id="nl-copy-to" label="Copy to workspace" className="min-w-48 flex-1">
                  <NativeSelect
                    id="nl-copy-to"
                    value={copyTo}
                    onChange={(e) => setCopyTo(e.target.value)}
                  >
                    {copyTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hydrated || pending || !copyTo || dirty}
                  data-testid="copy-newsletter"
                  onClick={() =>
                    start(async () => {
                      const r = await copyNewsletter({
                        workspaceId: ws.id,
                        id: newsletter.id,
                        targetWorkspaceId: copyTo,
                      });
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      const target = copyTargets.find((t) => t.id === copyTo);
                      toast.success(`Copied to ${target?.name} as a draft`, {
                        action: target
                          ? {
                              label: "Open",
                              onClick: () =>
                                router.push(`/w/${target.slug}/outreach/newsletters/${r.data.id}`),
                            }
                          : undefined,
                      });
                    })
                  }
                >
                  <Copy aria-hidden /> Copy as draft
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Same content, separate list: the copy goes to that workspace&apos;s own contacts and
              uses its own sender details.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-brand-danger"
              disabled={!hydrated || pending}
              onClick={() => {
                if (!confirm("Delete this draft?")) return;
                start(async () => {
                  const r = await deleteNewsletter({ workspaceId: ws.id, id: newsletter.id });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Draft deleted");
                  router.push(`/w/${ws.slug}/outreach`);
                });
              }}
            >
              Delete draft
            </Button>
          </section>
        )}
      </div>

      <section className="space-y-2" aria-labelledby="pv-h">
        <h2 id="pv-h" className="flex items-center gap-2 font-sans text-base font-bold">
          <Eye className="size-4" aria-hidden /> Preview
        </h2>
        <p className="text-xs text-muted-foreground">
          Subject: <span className="font-medium text-foreground">{preview.subject || "—"}</span>
        </p>
        <iframe
          title="Newsletter preview"
          sandbox=""
          srcDoc={preview.html}
          className="h-[640px] w-full rounded-xl border bg-white"
          data-testid="newsletter-preview"
        />
      </section>
    </div>
  );
}
