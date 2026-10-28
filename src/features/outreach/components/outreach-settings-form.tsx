"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { formatHour } from "../compliance";
import { TIME_ZONES } from "../schema";
import { saveOutreachSettings } from "../server/actions";

export type OutreachSettingsInitial = {
  sender_name: string;
  from_email: string;
  reply_to: string;
  mailing_address: string;
  time_zone: string;
  sms_send_from: string;
  sms_send_until: string;
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function OutreachSettingsForm({
  initial,
  readOnly,
}: {
  initial: OutreachSettingsInitial;
  readOnly: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const err = (k: keyof OutreachSettingsInitial) => errors[k]?.[0];
  const set =
    (k: keyof OutreachSettingsInitial) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));

  const text = (k: keyof OutreachSettingsInitial, label: string, help: string, props = {}) => (
    <Field id={`os-${k}`} label={label} error={err(k)} help={help}>
      <Input
        id={`os-${k}`}
        value={v[k]}
        onChange={set(k)}
        aria-invalid={Boolean(err(k))}
        disabled={readOnly}
        {...props}
      />
    </Field>
  );

  return (
    <form
      noValidate
      className="rounded-xl border bg-card px-4 sm:px-6"
      data-testid="outreach-settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        setErrors({});
        setFormError(null);
        start(async () => {
          const r = await saveOutreachSettings({ workspaceId: ws.id, values: v });
          if (!r.ok) {
            setFormError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          toast.success("Outreach settings saved");
          router.refresh();
        });
      }}
    >
      {formError && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {formError}
        </p>
      )}
      <FormSection
        title="Email sender (CAN-SPAM)"
        description="Every newsletter shows who it's from and a real mailing address. Nothing can be sent until these are set."
      >
        {text("sender_name", "Sender name", "Shown as the From name, e.g. your business name.")}
        {text(
          "from_email",
          "From address",
          "Must be on a domain verified in your Resend account.",
          {
            type: "email",
            autoComplete: "off",
          },
        )}
        {text("reply_to", "Reply-to address", "Where replies go. Optional.", {
          type: "email",
          autoComplete: "off",
        })}
        <Field
          id="os-mailing_address"
          label="Mailing address"
          error={err("mailing_address")}
          help="A street address or a registered P.O. box. Printed in every email's footer."
          className="sm:col-span-2"
        >
          <Textarea
            id="os-mailing_address"
            rows={2}
            value={v.mailing_address}
            onChange={set("mailing_address")}
            aria-invalid={Boolean(err("mailing_address"))}
            disabled={readOnly}
          />
        </Field>
      </FormSection>
      <FormSection
        title="Texting hours (TCPA)"
        description="Texts only go out inside these hours, in this time zone. You can narrow the federal 8am–9pm window, not widen it."
      >
        <Field
          id="os-time_zone"
          label="Time zone"
          error={err("time_zone")}
          className="sm:col-span-2"
        >
          <NativeSelect
            id="os-time_zone"
            value={v.time_zone}
            onChange={set("time_zone")}
            disabled={readOnly}
          >
            {TIME_ZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.value})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="os-sms_send_from" label="Earliest text" error={err("sms_send_from")}>
          <NativeSelect
            id="os-sms_send_from"
            value={v.sms_send_from}
            onChange={set("sms_send_from")}
            disabled={readOnly}
          >
            {range(8, 20).map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="os-sms_send_until" label="No texts after" error={err("sms_send_until")}>
          <NativeSelect
            id="os-sms_send_until"
            value={v.sms_send_until}
            onChange={set("sms_send_until")}
            disabled={readOnly}
          >
            {range(9, 21).map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormSection>
      {!readOnly && (
        <div className="sticky bottom-16 flex justify-end gap-2 border-t bg-card py-3 lg:bottom-0">
          <Button
            type="submit"
            disabled={!hydrated || pending}
            data-testid="save-outreach-settings"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
