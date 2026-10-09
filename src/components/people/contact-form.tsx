"use client";

import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityPicker, type PickedEntity } from "@/components/common/entity-picker";
import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_ROLES } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/common";
import { createContact, updateContact, type DuplicateMatch } from "@/server/actions/contacts";

type EmailRow = { value: string; label: string; is_primary: boolean };
type PhoneRow = {
  value: string;
  label: string;
  type: "mobile" | "landline" | "unknown";
  is_primary: boolean;
};

export type ContactFormInitial = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  company?: PickedEntity | null;
  roles?: string[];
  emails?: EmailRow[];
  phones?: PhoneRow[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  source?: string | null;
  tags?: string[];
  assigned_to?: string | null;
  language?: "en" | "es";
  dnc?: boolean;
  sms_consent?: "none" | "express" | "written";
  sms_consent_source?: string | null;
  email_opt_out?: boolean;
  notes?: string | null;
};

const SOURCES = [
  "Referral",
  "GHL import",
  "Website",
  "Broker call",
  "Direct mail",
  "Cold call",
  "Event",
  "Sign call",
];

export function ContactForm({ initial }: { initial?: ContactFormInitial }) {
  const ws = useWorkspace();
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  const [v, setV] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    title: initial?.title ?? "",
    roles: initial?.roles ?? [],
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "CA",
    zip: initial?.zip ?? "",
    source: initial?.source ?? "",
    tags: (initial?.tags ?? []).join(", "),
    assigned_to: initial?.assigned_to ?? (editing ? "" : ws.userId),
    language: initial?.language ?? "en",
    dnc: initial?.dnc ?? false,
    sms_consent: initial?.sms_consent ?? "none",
    sms_consent_source: initial?.sms_consent_source ?? "",
    email_opt_out: initial?.email_opt_out ?? false,
    notes: initial?.notes ?? "",
  });
  const [company, setCompany] = useState<PickedEntity | null>(initial?.company ?? null);
  const [emails, setEmails] = useState<EmailRow[]>(
    initial?.emails?.length ? initial.emails : [{ value: "", label: "work", is_primary: true }],
  );
  const [phones, setPhones] = useState<PhoneRow[]>(
    initial?.phones?.length
      ? initial.phones
      : [{ value: "", label: "mobile", type: "mobile", is_primary: true }],
  );

  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) =>
    setV((s) => ({ ...s, [key]: value }));
  const err = (key: string) => errors[key]?.[0];

  function submit(allowDuplicate = false) {
    setFormError(null);
    setErrors({});
    const contact = {
      ...v,
      company_id: company?.id ?? null,
      assigned_to: v.assigned_to || null,
      tags: v.tags.split(/[,;]/),
      emails: emails.filter((e) => e.value.trim()),
      phones: phones.filter((p) => p.value.trim()),
    };
    start(async () => {
      const result = editing
        ? await updateContact({ workspaceId: ws.id, contactId: initial!.id!, contact })
        : await createContact({ workspaceId: ws.id, contact, allowDuplicate });
      if (result.ok) {
        toast.success(editing ? "Contact saved" : "Contact created");
        router.push(`/w/${ws.slug}/people/${result.data.id}`);
        return;
      }
      if ("duplicates" in result && result.duplicates.length) {
        setDuplicates(result.duplicates);
        return;
      }
      setFormError(result.error);
      if ("fieldErrors" in result && result.fieldErrors) setErrors(result.fieldErrors);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="rounded-xl border bg-card px-4 sm:px-6"
      noValidate
    >
      {formError && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {formError}
        </p>
      )}
      {duplicates.length > 0 && (
        <div
          role="alert"
          className="mt-4 space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">
            Possible duplicate — a contact with this email or phone already exists:
          </p>
          <ul className="list-inside list-disc">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link className="font-semibold underline" href={`/w/${ws.slug}/people/${d.id}`}>
                  {d.name ?? "Unnamed contact"}
                </Link>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => submit(true)}
            disabled={pending}
          >
            Create anyway
          </Button>
        </div>
      )}

      <FormSection title="Person" description="Name, company and what they are to you.">
        <Field id="first_name" label="First name" error={err("first_name")}>
          <Input
            id="first_name"
            value={v.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            autoComplete="off"
            aria-invalid={Boolean(err("first_name"))}
          />
        </Field>
        <Field id="last_name" label="Last name" error={err("last_name")}>
          <Input
            id="last_name"
            value={v.last_name}
            onChange={(e) => set("last_name", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id="title" label="Title" error={err("title")}>
          <Input
            id="title"
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Owner, Broker, Property manager…"
          />
        </Field>
        <Field id="company" label="Company">
          <EntityPicker
            id="company"
            entityType="company"
            value={company}
            onChange={setCompany}
            placeholder="Search companies…"
          />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold" id="roles-label">
            Roles
          </p>
          <div role="group" aria-labelledby="roles-label" className="flex flex-wrap gap-1.5">
            {CONTACT_ROLES.map((r) => {
              const on = v.roles.includes(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set("roles", on ? v.roles.filter((x) => x !== r.value) : [...v.roles, r.value])
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    on
                      ? "border-brand-ink bg-brand-ink text-white"
                      : "border-input hover:bg-accent",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Email & phone"
        description="Used to find duplicates. Mark one of each as primary."
      >
        <div className="space-y-2 sm:col-span-2">
          {emails.map((e, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Email ${i + 1}`}
                type="email"
                inputMode="email"
                value={e.value}
                onChange={(ev) =>
                  setEmails(emails.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))
                }
                placeholder="name@company.com"
                aria-invalid={Boolean(err(`emails.${i}.value`))}
              />
              <Button
                type="button"
                variant={e.is_primary ? "secondary" : "ghost"}
                size="icon"
                aria-label={e.is_primary ? "Primary email" : "Make primary"}
                aria-pressed={e.is_primary}
                onClick={() => setEmails(emails.map((x, j) => ({ ...x, is_primary: j === i })))}
              >
                <Star className={cn(e.is_primary && "fill-current")} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove email ${i + 1}`}
                onClick={() => setEmails(emails.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {Object.entries(errors)
            .filter(([k]) => k.startsWith("emails."))
            .map(([k, m]) => (
              <p key={k} role="alert" className="text-xs font-medium text-brand-danger">
                {m?.[0]}
              </p>
            ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setEmails([...emails, { value: "", label: "other", is_primary: emails.length === 0 }])
            }
          >
            <Plus aria-hidden /> Add email
          </Button>
        </div>
        <div className="space-y-2 sm:col-span-2">
          {phones.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Phone ${i + 1}`}
                type="tel"
                inputMode="tel"
                value={p.value}
                onChange={(ev) =>
                  setPhones(phones.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))
                }
                placeholder="(619) 555-0100"
                aria-invalid={Boolean(err(`phones.${i}.value`))}
              />
              <NativeSelect
                aria-label={`Phone ${i + 1} type`}
                className="w-32"
                value={p.type}
                onChange={(ev) =>
                  setPhones(
                    phones.map((x, j) =>
                      j === i ? { ...x, type: ev.target.value as PhoneRow["type"] } : x,
                    ),
                  )
                }
              >
                <option value="mobile">Mobile</option>
                <option value="landline">Landline</option>
                <option value="unknown">Unknown</option>
              </NativeSelect>
              <Button
                type="button"
                variant={p.is_primary ? "secondary" : "ghost"}
                size="icon"
                aria-label={p.is_primary ? "Primary phone" : "Make primary"}
                aria-pressed={p.is_primary}
                onClick={() => setPhones(phones.map((x, j) => ({ ...x, is_primary: j === i })))}
              >
                <Star className={cn(p.is_primary && "fill-current")} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove phone ${i + 1}`}
                onClick={() => setPhones(phones.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {Object.entries(errors)
            .filter(([k]) => k.startsWith("phones."))
            .map(([k, m]) => (
              <p key={k} role="alert" className="text-xs font-medium text-brand-danger">
                {m?.[0]}
              </p>
            ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPhones([
                ...phones,
                { value: "", label: "other", type: "unknown", is_primary: phones.length === 0 },
              ])
            }
          >
            <Plus aria-hidden /> Add phone
          </Button>
        </div>
      </FormSection>

      <FormSection title="Address">
        <Field id="address" label="Street" className="sm:col-span-2">
          <Input
            id="address"
            value={v.address}
            onChange={(e) => set("address", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id="city" label="City">
          <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="state" label="State">
            <Input id="state" value={v.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field id="zip" label="ZIP">
            <Input
              id="zip"
              inputMode="numeric"
              value={v.zip}
              onChange={(e) => set("zip", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Organize">
        <Field id="source" label="Source" help="Where this contact came from.">
          <Input
            id="source"
            list="source-options"
            value={v.source}
            onChange={(e) => set("source", e.target.value)}
          />
          <datalist id="source-options">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field id="tags" label="Tags" help="Comma-separated, e.g. long-hold, north-park">
          <Input id="tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} />
        </Field>
        <Field id="assigned_to" label="Assigned to">
          <NativeSelect
            id="assigned_to"
            value={v.assigned_to}
            onChange={(e) => set("assigned_to", e.target.value)}
          >
            <option value="">Unassigned</option>
            {ws.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === ws.userId ? `${m.name} (me)` : m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="language" label="Preferred language">
          <NativeSelect
            id="language"
            value={v.language}
            onChange={(e) => set("language", e.target.value as "en" | "es")}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </NativeSelect>
        </Field>
      </FormSection>

      <FormSection
        title="Compliance"
        description="Outreach (Phase 4) is blocked unless these allow it. Record consent evidence for TCPA."
      >
        <label className="flex items-start gap-3 sm:col-span-2">
          <Checkbox
            checked={v.dnc}
            onCheckedChange={(c) => set("dnc", c === true)}
            aria-describedby="dnc-help"
          />
          <span>
            <span className="text-sm font-semibold">Do not contact (DNC)</span>
            <span id="dnc-help" className="block text-xs text-muted-foreground">
              Blocks all calls, texts and emails.
            </span>
          </span>
        </label>
        <Field id="sms_consent" label="SMS consent (TCPA)">
          <NativeSelect
            id="sms_consent"
            value={v.sms_consent}
            onChange={(e) => set("sms_consent", e.target.value as typeof v.sms_consent)}
          >
            <option value="none">None — texting blocked</option>
            <option value="express">Express consent</option>
            <option value="written">Written consent</option>
          </NativeSelect>
        </Field>
        <Field
          id="sms_consent_source"
          label="How consent was given"
          error={err("sms_consent_source")}
          required={v.sms_consent !== "none"}
        >
          <Input
            id="sms_consent_source"
            value={v.sms_consent_source}
            disabled={v.sms_consent === "none"}
            onChange={(e) => set("sms_consent_source", e.target.value)}
            placeholder="e.g. Signed web form 2026-10-01"
            aria-invalid={Boolean(err("sms_consent_source"))}
          />
        </Field>
        <label className="flex items-start gap-3 sm:col-span-2">
          <Checkbox
            checked={v.email_opt_out}
            onCheckedChange={(c) => set("email_opt_out", c === true)}
          />
          <span>
            <span className="text-sm font-semibold">Unsubscribed from email (CAN-SPAM)</span>
          </span>
        </label>
      </FormSection>

      <FormSection title="Notes">
        <Field id="notes" label="Notes" className="sm:col-span-2">
          <Textarea
            id="notes"
            rows={4}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </FormSection>

      <div className="sticky bottom-16 flex justify-end gap-2 border-t bg-card py-3 lg:bottom-0">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={!hydrated || pending} data-testid="save-contact">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "Save changes" : "Create contact"}
        </Button>
      </div>
    </form>
  );
}
