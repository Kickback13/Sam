"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityPicker, type PickedEntity } from "@/components/common/entity-picker";
import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PROPERTY_TYPES } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";
import { saveProperty } from "@/server/actions/properties";

type Str = string;
export type PropertyFormInitial = Partial<
  Record<
    | "name"
    | "address"
    | "city"
    | "state"
    | "zip"
    | "county"
    | "apn"
    | "lat"
    | "lng"
    | "property_type"
    | "units"
    | "buildings"
    | "building_sqft"
    | "lot_sqft"
    | "year_built"
    | "zoning"
    | "submarket"
    | "last_sale_date"
    | "last_sale_price"
    | "assessed_value"
    | "notes",
    Str
  >
> & {
  id?: string;
  tags?: string[];
  owner?: PickedEntity | null;
  ownerCompany?: PickedEntity | null;
};

const NUMERIC: { key: keyof PropertyFormInitial; label: string; help?: string; money?: boolean }[] =
  [
    { key: "units", label: "Units" },
    { key: "buildings", label: "Buildings" },
    { key: "building_sqft", label: "Building sq ft" },
    { key: "lot_sqft", label: "Lot sq ft" },
    { key: "year_built", label: "Year built" },
  ];

export function PropertyForm({ initial }: { initial?: PropertyFormInitial }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [v, setV] = useState<Record<string, string>>({
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "San Diego",
    state: initial?.state ?? "CA",
    zip: initial?.zip ?? "",
    county: initial?.county ?? "San Diego",
    apn: initial?.apn ?? "",
    lat: initial?.lat ?? "",
    lng: initial?.lng ?? "",
    property_type: initial?.property_type ?? "",
    units: initial?.units ?? "",
    buildings: initial?.buildings ?? "",
    building_sqft: initial?.building_sqft ?? "",
    lot_sqft: initial?.lot_sqft ?? "",
    year_built: initial?.year_built ?? "",
    zoning: initial?.zoning ?? "",
    submarket: initial?.submarket ?? "",
    last_sale_date: initial?.last_sale_date ?? "",
    last_sale_price: initial?.last_sale_price ?? "",
    assessed_value: initial?.assessed_value ?? "",
    notes: initial?.notes ?? "",
    tags: (initial?.tags ?? []).join(", "),
  });
  const [owner, setOwner] = useState<PickedEntity | null>(initial?.owner ?? null);
  const [ownerCompany, setOwnerCompany] = useState<PickedEntity | null>(
    initial?.ownerCompany ?? null,
  );
  const set = (k: string, value: string) => setV((s) => ({ ...s, [k]: value }));
  const err = (k: string) => errors[k]?.[0];
  const text = (
    k: string,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    className?: string,
  ) => (
    <Field key={k} id={k} label={label} error={err(k)} className={className}>
      <Input
        id={k}
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
          const result = await saveProperty({
            workspaceId: ws.id,
            propertyId: initial?.id,
            property: {
              ...v,
              tags: v.tags.split(/[,;]/),
              owner_contact_id: owner?.id ?? null,
              owner_company_id: ownerCompany?.id ?? null,
            },
          });
          if (!result.ok) {
            setFormError(result.error);
            setErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success(initial?.id ? "Property saved" : "Property created");
          router.push(`/w/${ws.slug}/properties/${result.data.id}`);
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
      <FormSection title="Location">
        {text(
          "address",
          "Street address",
          { required: true, autoComplete: "off" },
          "sm:col-span-2",
        )}
        {text(
          "name",
          "Property name",
          { placeholder: "Optional, e.g. Sunset Apartments" },
          "sm:col-span-2",
        )}
        {text("city", "City")}
        <div className="grid grid-cols-2 gap-3">
          {text("state", "State")}
          {text("zip", "ZIP", { inputMode: "numeric" })}
        </div>
        {text("county", "County")}
        {text("apn", "APN", { placeholder: "From the county assessor" })}
        {text("submarket", "Submarket", { placeholder: "e.g. North Park" })}
        {text("zoning", "Zoning")}
      </FormSection>
      <FormSection
        title="Building"
        description="Values you enter are stamped “Entered by you” with today's date."
      >
        <Field id="property_type" label="Type">
          <NativeSelect
            id="property_type"
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
        {NUMERIC.map((n) => text(n.key as string, n.label, { inputMode: "numeric" }))}
      </FormSection>
      <FormSection title="Ownership & value">
        <Field id="owner" label="Owner (person)">
          <EntityPicker
            id="owner"
            entityType="contact"
            value={owner}
            onChange={setOwner}
            placeholder="Search people…"
          />
        </Field>
        <Field id="owner_company" label="Owner (entity)">
          <EntityPicker
            id="owner_company"
            entityType="company"
            value={ownerCompany}
            onChange={setOwnerCompany}
            placeholder="Search companies…"
          />
        </Field>
        {text("last_sale_date", "Last sale date", { type: "date" })}
        {text("last_sale_price", "Last sale price ($)", { inputMode: "decimal" })}
        {text("assessed_value", "Assessed value ($)", { inputMode: "decimal" })}
        <div className="grid grid-cols-2 gap-3">
          {text("lat", "Latitude", { inputMode: "decimal" })}
          {text("lng", "Longitude", { inputMode: "decimal" })}
        </div>
      </FormSection>
      <FormSection title="Notes">
        {text("tags", "Tags", { placeholder: "Comma-separated" })}
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
        <Button type="submit" disabled={!hydrated || pending} data-testid="save-property">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {initial?.id ? "Save changes" : "Create property"}
        </Button>
      </div>
    </form>
  );
}
