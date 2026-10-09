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
import { COMPANY_TYPES } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";
import { saveCompany } from "@/server/actions/companies";

export type CompanyFormInitial = {
  id?: string;
  name?: string;
  type?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  tags?: string[];
};

export function CompanyForm({ initial }: { initial?: CompanyFormInitial }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [v, setV] = useState({
    name: initial?.name ?? "",
    type: initial?.type ?? "",
    website: initial?.website ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "CA",
    zip: initial?.zip ?? "",
    notes: initial?.notes ?? "",
    tags: (initial?.tags ?? []).join(", "),
  });
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  const err = (k: string) => errors[k]?.[0];

  return (
    <form
      noValidate
      className="rounded-xl border bg-card px-4 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setFormError(null);
        start(async () => {
          const result = await saveCompany({
            workspaceId: ws.id,
            companyId: initial?.id,
            company: { ...v, tags: v.tags.split(/[,;]/) },
          });
          if (!result.ok) {
            setFormError(result.error);
            setErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success(initial?.id ? "Company saved" : "Company created");
          router.push(`/w/${ws.slug}/companies/${result.data.id}`);
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
      <FormSection title="Company">
        <Field id="name" label="Name" error={err("name")} required className="sm:col-span-2">
          <Input
            id="name"
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(err("name"))}
          />
        </Field>
        <Field id="type" label="Type">
          <NativeSelect id="type" value={v.type} onChange={(e) => set("type", e.target.value)}>
            <option value="">—</option>
            {COMPANY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="website" label="Website" error={err("website")}>
          <Input
            id="website"
            type="url"
            inputMode="url"
            value={v.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field id="phone" label="Phone">
          <Input
            id="phone"
            type="tel"
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field id="email" label="Email" error={err("email")}>
          <Input
            id="email"
            type="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={Boolean(err("email"))}
          />
        </Field>
      </FormSection>
      <FormSection title="Address">
        <Field id="address" label="Street" className="sm:col-span-2">
          <Input id="address" value={v.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field id="city" label="City">
          <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="state" label="State">
            <Input id="state" value={v.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field id="zip" label="ZIP">
            <Input id="zip" value={v.zip} onChange={(e) => set("zip", e.target.value)} />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Notes">
        <Field id="tags" label="Tags" help="Comma-separated">
          <Input id="tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} />
        </Field>
        <Field id="notes" label="Notes" className="sm:col-span-2">
          <Textarea
            id="notes"
            rows={3}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </FormSection>
      <div className="sticky bottom-16 flex justify-end gap-2 border-t bg-card py-3 lg:bottom-0">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={!hydrated || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {initial?.id ? "Save changes" : "Create company"}
        </Button>
      </div>
    </form>
  );
}
