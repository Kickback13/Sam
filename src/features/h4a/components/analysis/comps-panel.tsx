"use client";

import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/common";

import type { AnalysisComp } from "../../server/analysis";
import { addComp, deleteComp } from "../../server/actions/analysis";

type Kind = "sale" | "rent";
const EMPTY = {
  address: "",
  city: "",
  zip: "",
  units: "",
  price: "",
  sale_date: "",
  cap_rate: "",
  unit_type: "",
  monthly_rent: "",
  distance_miles: "",
  source_label: "",
  source_url: "",
  as_of: "",
  notes: "",
};
type Draft = typeof EMPTY;

export function CompsPanel({
  propertyId,
  comps,
  stats,
}: {
  propertyId: string;
  comps: AnalysisComp[];
  stats: {
    saleCount: number;
    saleMedianPricePerUnit: number | null;
    saleMedianCapRate: number | null;
  };
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<Kind>("sale");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const sale = comps.filter((c) => c.kind === "sale");
  const rent = comps.filter((c) => c.kind === "rent");

  const field = (k: keyof Draft, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field id={`comp-${k}`} label={label} error={errors[k]?.[0]} required={props.required}>
      <Input
        id={`comp-${k}`}
        value={draft[k]}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        aria-invalid={Boolean(errors[k])}
        data-testid={`comp-${k}`}
        {...props}
      />
    </Field>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setFormError(null);
      const r = await addComp({ workspaceId: ws.id, propertyId, comp: { ...draft, kind } });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        return;
      }
      setErrors({});
      setDraft(EMPTY);
      setOpen(false);
      toast.success("Comp added");
      router.refresh();
    });
  };

  const remove = (c: AnalysisComp) =>
    start(async () => {
      if (!confirm(`Remove the comp at ${c.address}?`)) return;
      const r = await deleteComp({ workspaceId: ws.id, id: c.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Comp removed");
      router.refresh();
    });

  const source = (c: AnalysisComp) => (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {c.source_url ? (
        <a
          href={c.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          {c.source_label} <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        c.source_label
      )}
      <span aria-hidden>·</span> as of {formatDate(c.as_of)}
    </span>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comps</CardTitle>
        <p className="text-xs text-muted-foreground">
          From Sam&apos;s exports, broker packages or public records — every comp says where it came
          from and as of when. Automatic comps arrive when a property data service is connected.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-1" data-testid="comps-panel">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-2">
            <dt className="text-[11px] text-muted-foreground">Sale comps</dt>
            <dd className="font-semibold tabular">{stats.saleCount}</dd>
          </div>
          <div className="rounded-md border p-2">
            <dt className="text-[11px] text-muted-foreground">Median $/unit</dt>
            <dd className="font-semibold tabular" data-testid="comps-median-ppu">
              {formatCurrency(stats.saleMedianPricePerUnit)}
            </dd>
          </div>
          <div className="rounded-md border p-2">
            <dt className="text-[11px] text-muted-foreground">Median cap</dt>
            <dd className="font-semibold tabular">
              {stats.saleMedianCapRate === null ? "—" : `${stats.saleMedianCapRate.toFixed(2)}%`}
            </dd>
          </div>
        </dl>

        {comps.length === 0 && <p className="text-sm text-muted-foreground">No comps yet.</p>}
        {sale.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Sales
            </h3>
            <ul className="divide-y rounded-md border">
              {sale.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold">{c.address}</p>
                    <p className="text-xs tabular">
                      {formatCurrency(c.price)}
                      {c.units
                        ? ` · ${formatNumber(c.units)} units · ${formatCurrency(c.price_per_unit)}/unit`
                        : ""}
                      {c.cap_rate !== null ? ` · ${c.cap_rate}% cap` : ""}
                      {c.sale_date ? ` · sold ${formatDate(c.sale_date)}` : ""}
                    </p>
                    {source(c)}
                  </div>
                  {ws.canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove comp ${c.address}`}
                      onClick={() => remove(c)}
                      disabled={pending}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {rent.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Rents
            </h3>
            <ul className="divide-y rounded-md border">
              {rent.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold">{c.address}</p>
                    <p className="text-xs tabular">
                      {c.unit_type ? `${c.unit_type} · ` : ""}
                      {formatCurrency(c.monthly_rent)}/mo
                    </p>
                    {source(c)}
                  </div>
                  {ws.canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove comp ${c.address}`}
                      onClick={() => remove(c)}
                      disabled={pending}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ws.canWrite &&
          (open ? (
            <form
              onSubmit={submit}
              className="space-y-3 rounded-md border p-3"
              noValidate
              data-testid="comp-form"
            >
              <div
                role="radiogroup"
                aria-label="Comp type"
                className="flex w-fit rounded-md border p-0.5 text-xs font-semibold"
              >
                {(["sale", "rent"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded px-2.5 py-1",
                      kind === k ? "bg-foreground text-background" : "hover:bg-muted",
                    )}
                    data-testid={`comp-kind-${k}`}
                  >
                    {k === "sale" ? "Sale comp" : "Rent comp"}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("address", "Address", { required: true })}
                {field("zip", "ZIP", { inputMode: "numeric" })}
                {kind === "sale" ? (
                  <>
                    {field("price", "Sale price", { required: true, inputMode: "decimal" })}
                    {field("units", "Units", { inputMode: "numeric" })}
                    {field("sale_date", "Sale date", { type: "date" })}
                    {field("cap_rate", "Cap rate %", { inputMode: "decimal" })}
                  </>
                ) : (
                  <>
                    {field("unit_type", "Unit type", { placeholder: "2BR/1BA" })}
                    {field("monthly_rent", "Rent / month", {
                      required: true,
                      inputMode: "decimal",
                    })}
                  </>
                )}
                {field("source_label", "Source", {
                  required: true,
                  placeholder: "e.g. Broker OM, County record",
                })}
                {field("as_of", "As of", { required: true, type: "date" })}
                {field("source_url", "Source link (optional)", { type: "url" })}
              </div>
              {formError && (
                <p role="alert" className="text-sm font-medium text-brand-danger">
                  {formError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={!hydrated || pending} data-testid="comp-save">
                  {pending && <Loader2 className="animate-spin" aria-hidden />} Add comp
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              data-testid="comp-add"
            >
              <Plus aria-hidden /> Add a comp
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
