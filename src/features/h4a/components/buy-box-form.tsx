"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PROPERTY_TYPES } from "@/lib/constants";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { saveBuyBox } from "../server/actions/buy-box";

export type BuyBoxFormInitial = {
  zips: string[];
  cities: string[];
  submarkets: string[];
  property_types: string[];
  units_min: string;
  units_max: string;
  price_min: string;
  price_max: string;
  max_price_per_unit: string;
  year_built_min: string;
  year_built_max: string;
  notes: string;
  alert_threshold: string;
};

type TextKey = Exclude<
  keyof BuyBoxFormInitial,
  "zips" | "cities" | "submarkets" | "property_types"
>;

export function BuyBoxForm({
  initial,
  readOnly,
}: {
  initial: BuyBoxFormInitial;
  readOnly: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lists, setLists] = useState({
    zips: initial.zips.join(", "),
    cities: initial.cities.join(", "),
    submarkets: initial.submarkets.join(", "),
  });
  const [types, setTypes] = useState<string[]>(initial.property_types);
  const [v, setV] = useState<Record<TextKey, string>>({
    units_min: initial.units_min,
    units_max: initial.units_max,
    price_min: initial.price_min,
    price_max: initial.price_max,
    max_price_per_unit: initial.max_price_per_unit,
    year_built_min: initial.year_built_min,
    year_built_max: initial.year_built_max,
    notes: initial.notes,
    alert_threshold: initial.alert_threshold,
  });
  const err = (k: string) => errors[k]?.[0] ?? errors[`${k}.0`]?.[0];
  const num = (k: TextKey, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field id={`bb-${k}`} label={label} error={err(k)}>
      <Input
        id={`bb-${k}`}
        value={v[k]}
        onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        aria-invalid={Boolean(err(k))}
        disabled={readOnly}
        inputMode="decimal"
        {...props}
      />
    </Field>
  );
  const list = (k: keyof typeof lists, label: string, help: string, placeholder: string) => (
    <Field id={`bb-${k}`} label={label} error={err(k)} help={help} className="sm:col-span-2">
      <Textarea
        id={`bb-${k}`}
        rows={2}
        value={lists[k]}
        placeholder={placeholder}
        onChange={(e) => setLists((s) => ({ ...s, [k]: e.target.value }))}
        aria-invalid={Boolean(err(k))}
        disabled={readOnly}
      />
    </Field>
  );

  return (
    <form
      noValidate
      className="rounded-xl border bg-card px-4 sm:px-6"
      data-testid="buy-box-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        setErrors({});
        setFormError(null);
        start(async () => {
          const r = await saveBuyBox({
            workspaceId: ws.id,
            buyBox: { ...lists, property_types: types, ...v },
          });
          if (!r.ok) {
            setFormError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          toast.success(
            `Buy box saved · re-scored ${r.data.rescored} open ${r.data.rescored === 1 ? "listing" : "listings"}`,
          );
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
        title="Where"
        description="A listing passes Location if its ZIP, city or submarket is on any of these lists."
      >
        {list("zips", "ZIP codes", "Separate with commas or spaces.", "92104, 92105, 92116")}
        {list("cities", "Cities", "Separate with commas.", "San Diego, La Mesa")}
        {list("submarkets", "Submarkets", "Separate with commas.", "North Park, City Heights")}
      </FormSection>
      <FormSection title="What">
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Property types</legend>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map((t) => {
              const checked = types.includes(t.value);
              return (
                <label
                  key={t.value}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-brand-ink has-[:checked]:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-black"
                    checked={checked}
                    disabled={readOnly}
                    onChange={() =>
                      setTypes((s) => (checked ? s.filter((x) => x !== t.value) : [...s, t.value]))
                    }
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        {num("units_min", "Units — min", { inputMode: "numeric" })}
        {num("units_max", "Units — max", { inputMode: "numeric" })}
        {num("year_built_min", "Year built — from", { inputMode: "numeric" })}
        {num("year_built_max", "Year built — to", { inputMode: "numeric" })}
      </FormSection>
      <FormSection title="Price">
        {num("price_min", "Price — min ($)")}
        {num("price_max", "Price — max ($)")}
        {num("max_price_per_unit", "Max price per unit ($)")}
      </FormSection>
      <FormSection
        title="Alerts & notes"
        description="An in-app alert fires when a new or updated listing scores at or above this threshold."
      >
        {num("alert_threshold", "Alert threshold (0–100)", { inputMode: "numeric" })}
        <Field id="bb-notes" label="Notes" className="sm:col-span-2">
          <Textarea
            id="bb-notes"
            rows={3}
            value={v.notes}
            onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))}
            disabled={readOnly}
          />
        </Field>
      </FormSection>
      {!readOnly && (
        <div className="sticky bottom-16 flex justify-end gap-2 border-t bg-card py-3 lg:bottom-0">
          <Button type="submit" disabled={!hydrated || pending} data-testid="save-buy-box">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Save and re-score
          </Button>
        </div>
      )}
    </form>
  );
}
