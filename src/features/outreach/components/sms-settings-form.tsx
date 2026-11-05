"use client";

import { Copy, KeyRound, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { createSmsWebhookToken, saveSmsSettings } from "../server/sms";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}

export function SmsSettingsForm({
  initial,
  providerConnected,
}: {
  initial: { enabled: boolean; fromNumber: string; messagingServiceSid: string; helpReply: string };
  providerConnected: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const readOnly = !ws.isAdmin;
  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="sms-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await saveSmsSettings({ workspaceId: ws.id, ...v });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          toast.success("Texting settings saved");
          router.refresh();
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-black"
          checked={v.enabled}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, enabled: e.target.checked }))}
          data-testid="sms-enabled"
        />
        Texting on (team members can send one-to-one texts that pass every gate)
      </label>
      {!providerConnected && v.enabled && (
        <p className="text-xs font-semibold text-muted-foreground">
          Even when on, nothing sends until the Twilio account details are added in Vercel.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="sms-from"
          label="Sending number"
          error={errors.fromNumber?.[0]}
          help="The Twilio number texts come from, e.g. (619) 555-0100."
        >
          <Input
            id="sms-from"
            inputMode="tel"
            value={v.fromNumber}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, fromNumber: e.target.value }))}
          />
        </Field>
        <Field
          id="sms-mg"
          label="Messaging Service SID (optional)"
          error={errors.messagingServiceSid?.[0]}
          help="Only if Twilio set you up with one (starts with MG). It's used instead of the number."
        >
          <Input
            id="sms-mg"
            value={v.messagingServiceSid}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, messagingServiceSid: e.target.value }))}
          />
        </Field>
      </div>
      <Field
        id="sms-help"
        label="Reply to HELP (optional)"
        help="Sent when someone texts HELP. Twilio answers STOP and START itself."
      >
        <Textarea
          id="sms-help"
          rows={2}
          maxLength={320}
          value={v.helpReply}
          disabled={readOnly}
          placeholder="Housing4All Premier Solutions: reply STOP to opt out. Questions? Call (619) 843-1663."
          onChange={(e) => setV((s) => ({ ...s, helpReply: e.target.value }))}
        />
      </Field>
      {!readOnly && (
        <Button type="submit" disabled={!hydrated || pending} data-testid="sms-save">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
        </Button>
      )}
    </form>
  );
}

export function SmsWebhookLinks({ base, hasWebhook }: { base: string; hasWebhook: boolean }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  if (!ws.isAdmin) return null;
  const inbound = token ? `${base}/api/sms/inbound/${token}` : null;
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4" data-testid="sms-webhooks">
      <h2 className="text-base font-bold">Receiving texts</h2>
      <p className="text-xs text-muted-foreground">
        In Twilio, open the phone number and paste this under <em>A message comes in</em> (HTTP
        POST). Replies then land on the contact&apos;s timeline with a task to answer, and STOP is
        added to the do-not-text list straight away.
      </p>
      {inbound ? (
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="min-w-0 rounded bg-muted px-2 py-1 text-xs break-all"
            data-testid="sms-inbound-url"
          >
            {inbound}
          </code>
          <Button size="sm" variant="outline" type="button" onClick={() => copy(inbound, "Link")}>
            <Copy aria-hidden /> Copy
          </Button>
          <p className="w-full text-xs font-semibold">Copy it now. It won&apos;t be shown again.</p>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={pending}
          data-testid="sms-make-link"
          onClick={() =>
            start(async () => {
              const r = await createSmsWebhookToken({ workspaceId: ws.id });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              setToken(r.data.token);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          {hasWebhook ? "Make a new link" : "Create the link"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Delivery reports come back on their own: every text the app sends tells Twilio where to
        report.
      </p>
    </section>
  );
}
