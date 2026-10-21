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
import { PROPERTY_TYPES } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { saveManualListing } from "../server/actions/listings";

const KEYS = [
  "address",
  "city",
  "state",
  "zip",
  "apn",
  "submarket",
  "property_type",
  "price",
  "units",
  "cap_rate",
  "year_built",
  "building_sqft",
  "lot_sqft",
  "broker_name",
  "broker_company",
  "broker_phone",
  "broker_email",
  "listing_url",
] as const;
type Key = (typeof KEYS)[number];
export type ListingFormInitial = Partial<Record<Key, string>> & { id?: string };

/** Manual entry: every value you type is sourced "Entered by <you>" with today's date. */
export function ListingForm({ initial }: { initial?: ListingFormInitial }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [v, setV] = useState<Record<Key, string>>(
    () =>
      Object.fromEntries(
        KEYS.map((k) => [
          k,
          initial?.[k] ?? (k === "state" ? "CA" : k === "city" && !initial?.id ? "San Diego" : ""),
        ]),
      ) as Record<Key, string>,
  );
  const set = (k: Key, value: string) => setV((s) => ({ ...s, [k]: value }));
  const err = (k: string) => errors[k]?.[0];
  const text = (
    k: Key,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    className?: string,
  ) => (
    <Field
      key={k}
      id={`listing-${k}`}
      label={label}
      error={err(k)}
      className={className}
      required={k === "address"}
    >
      <Input
        id={`listing-${k}`}
        value={v[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={Boolean(err(k))}
        {...props}
      />
    </Field>
  );

  return (
    <form
      noValidate
      className="rounded-xl border bg-card px-4 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setFormError(null);
        start(async () => {
          const r = await saveManualListing({
            workspaceId: ws.id,
            workspaceSlug: ws.slug,
            listingId: initial?.id,
            fields: v,
          });
          if (!r.ok) {
            setFormError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          toast.success(
            r.data.action === "created"
              ? "Listing added"
              : r.data.action === "updated"
                ? initial?.id
                  ? "Listing updated"
                  : "Already in Deal Finder — updated the existing listing"
                : "No changes",
          );
          router.push(`/w/${ws.slug}/deal-finder/${r.data.id}`);
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
        title="Location"
        description="If this building is already in Deal Finder (same address or APN), that listing is updated instead."
      >
        {text(
          "address",
          "Street address",
          { autoComplete: "off", placeholder: "e.g. 3100 Sample Ave" },
          "sm:col-span-2",
        )}
        {text("city", "City")}
        <div className="grid grid-cols-2 gap-3">
          {text("state", "State")}
          {text("zip", "ZIP", { inputMode: "numeric" })}
        </div>
        {text("apn", "APN", { placeholder: "123-456-78-90" })}
        {text("submarket", "Submarket", { placeholder: "e.g. North Park" })}
      </FormSection>
      <FormSection
        title="Price & building"
        description={
          initial?.id
            ? "Values you change are stamped “Entered by you” and outrank alert emails and CSV rows."
            : "Values you enter are stamped “Entered by you” with today's date."
        }
      >
        {text("price", "Price ($)", { inputMode: "decimal" })}
        {text("units", "Units", { inputMode: "numeric" })}
        {text("cap_rate", "Cap rate (%)", {
          inputMode: "decimal",
          placeholder: "Only if the source states it",
        })}
        <Field id="listing-property_type" label="Type" error={err("property_type")}>
          <NativeSelect
            id="listing-property_type"
            value={v.property_type}
            onChange={(e) => set("property_type", e.target.value)}
          >
            <option value="">—</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("year_built", "Year built", { inputMode: "numeric" })}
        {text("building_sqft", "Building sq ft", { inputMode: "numeric" })}
        {text("lot_sqft", "Lot sq ft", { inputMode: "numeric" })}
      </FormSection>
      <FormSection title="Broker">
        {text("broker_name", "Name")}
        {text("broker_company", "Brokerage")}
        {text("broker_phone", "Phone", { inputMode: "tel" })}
        {text("broker_email", "Email", { type: "email", inputMode: "email" })}
        {text(
          "listing_url",
          "Link to the original listing",
          { inputMode: "url", placeholder: "https://…" },
          "sm:col-span-2",
        )}
      </FormSection>
      <div className="sticky bottom-16 flex justify-end gap-2 border-t bg-card py-3 lg:bottom-0">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={!hydrated || pending} data-testid="save-listing">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {initial?.id ? "Save changes" : "Add listing"}
        </Button>
      </div>
    </form>
  );
}
