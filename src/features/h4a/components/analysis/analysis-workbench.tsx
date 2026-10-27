"use client";

import { AlertTriangle, FileDown, Info, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { SourceChip } from "@/components/common/source-chip";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/common";

import type { AnalysisScenario } from "../../server/analysis";
import { deleteScenario, saveScenario } from "../../server/actions/analysis";
import { redFlags, type FlagContext, type RedFlag } from "../../underwriting/flags";
import { formatMetric } from "../../underwriting/format";
import {
  INPUT_LABELS,
  METRIC_GROUPS,
  underwrite,
  type InputKey,
  type Metric,
  type UnderwritingInputs,
} from "../../underwriting/math";
import type { InputSources } from "../../underwriting/prefill";

type NumKey = Exclude<InputKey, "unitMix" | "expenseMode">;
type MixRow = { label: string; count: string; monthlyRent: string };

const NUM_KEYS: NumKey[] = [
  "price",
  "units",
  "buildingSqft",
  "monthlyRentTotal",
  "otherIncomeMonthly",
  "vacancyPct",
  "taxRatePct",
  "insurance",
  "utilities",
  "repairs",
  "managementPct",
  "payroll",
  "otherExpenses",
  "expenseRatioPct",
  "ltvPct",
  "interestRatePct",
  "amortYears",
  "closingCosts",
];

const HELP: Partial<Record<NumKey, string>> = {
  price: "Asking or offer price.",
  vacancyPct: "Share of scheduled rent you expect to lose.",
  taxRatePct: "California reassesses at sale: about 1% + local charges (Prop 13).",
  managementPct: "Of effective gross income.",
  expenseRatioPct: "Operating expenses as a share of effective gross income.",
};

const toNum = (s: string): number | null => {
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const toStr = (n: number | null) => (n === null ? "" : String(n));

type Baseline = {
  id: string | null;
  name: string;
  inputs: UnderwritingInputs;
  sources: InputSources;
  notes: string;
};

function formState(b: Baseline) {
  const values = Object.fromEntries(
    NUM_KEYS.map((k) => [k, toStr(b.inputs[k] as number | null)]),
  ) as Record<NumKey, string>;
  const mix: MixRow[] = b.inputs.unitMix.map((r) => ({
    label: r.label,
    count: String(r.count),
    monthlyRent: String(r.monthlyRent),
  }));
  return { values, mix, mode: b.inputs.expenseMode, name: b.name, notes: b.notes };
}

export function AnalysisWorkbench({
  propertyId,
  prefill,
  scenarios,
  initialScenarioId,
  flagContext,
}: {
  propertyId: string;
  prefill: { inputs: UnderwritingInputs; sources: InputSources };
  scenarios: AnalysisScenario[];
  initialScenarioId: string | null;
  flagContext: FlagContext;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const readOnly = !ws.canWrite;

  const baselineFor = (id: string | null): Baseline => {
    const s = scenarios.find((x) => x.id === id);
    return s
      ? { id: s.id, name: s.name, inputs: s.inputs, sources: s.sources, notes: s.notes ?? "" }
      : {
          id: null,
          name: scenarios.length ? "New scenario" : "Asking price",
          ...prefill,
          notes: "",
        };
  };

  const [baseline, setBaseline] = useState<Baseline>(() => baselineFor(initialScenarioId));
  // Remounted by the page (key) whenever the saved data changes, so this stays in sync.
  const [form, setForm] = useState(() => formState(baseline));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const inputs: UnderwritingInputs = useMemo(() => {
    const out = { expenseMode: form.mode, unitMix: [] } as unknown as UnderwritingInputs;
    for (const k of NUM_KEYS) (out[k] as number | null) = toNum(form.values[k]);
    out.unitMix = form.mix
      .map((r) => ({
        label: r.label.trim(),
        count: toNum(r.count) ?? 0,
        monthlyRent: toNum(r.monthlyRent) ?? 0,
      }))
      .filter((r) => r.label || r.count || r.monthlyRent);
    return out;
  }, [form]);

  const result = useMemo(() => underwrite(inputs), [inputs]);
  const flags = useMemo(() => redFlags(inputs, result, flagContext), [inputs, result, flagContext]);

  const isEdited = (k: InputKey) =>
    JSON.stringify(inputs[k] ?? null) !== JSON.stringify(baseline.inputs[k] ?? null);
  const dirty =
    (Object.keys(inputs) as InputKey[]).some(isEdited) ||
    form.name !== baseline.name ||
    form.notes !== baseline.notes;

  const switchTo = (id: string | null) => {
    const b = baselineFor(id);
    setBaseline(b);
    setForm(formState(b));
    setErrors({});
    setFormError(null);
    router.replace(id ? `?scenario=${id}` : "?", { scroll: false });
  };

  const save = (asNew: boolean) =>
    start(async () => {
      setFormError(null);
      const r = await saveScenario({
        workspaceId: ws.id,
        propertyId,
        scenarioId: asNew ? null : baseline.id,
        name: asNew && baseline.id ? `${form.name} (copy)` : form.name,
        inputs: {
          ...inputs,
          unitMix: form.mix.filter((m) => m.label.trim() || m.count.trim() || m.monthlyRent.trim()),
        },
        notes: form.notes,
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        return;
      }
      toast.success("Scenario saved");
      // The page re-renders with the saved scenario (and its sources) and remounts this form.
      router.replace(`?scenario=${r.data.id}`, { scroll: false });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!baseline.id || !confirm(`Delete “${baseline.name}”?`)) return;
      const r = await deleteScenario({ workspaceId: ws.id, id: baseline.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Scenario deleted");
      switchTo(null);
      router.refresh();
    });

  const err = (k: string) => errors[k]?.[0];
  const sourceFor = (k: InputKey) => {
    const value = inputs[k];
    const empty = value === null || (Array.isArray(value) && value.length === 0);
    if (empty) return null;
    if (isEdited(k))
      return (
        <span className="text-[11px] font-medium text-brand-accent-text">
          Edited — saves as “Entered by you”
        </span>
      );
    return <SourceChip source={baseline.sources[k]} />;
  };

  const numField = (k: NumKey, opts: { prefix?: string; suffix?: string } = {}) => (
    <Field key={k} id={`uw-${k}`} label={INPUT_LABELS[k]} error={err(k)} help={HELP[k]}>
      <div className="relative">
        {opts.prefix && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            {opts.prefix}
          </span>
        )}
        <Input
          id={`uw-${k}`}
          inputMode="decimal"
          value={form.values[k]}
          onChange={(e) => setForm((f) => ({ ...f, values: { ...f.values, [k]: e.target.value } }))}
          className={cn(opts.prefix && "pl-7", opts.suffix && "pr-8")}
          aria-invalid={Boolean(err(k))}
          disabled={readOnly}
          data-testid={`uw-${k}`}
        />
        {opts.suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {opts.suffix}
          </span>
        )}
      </div>
      <div className="min-h-4">{sourceFor(k)}</div>
    </Field>
  );

  const section = (title: string, children: React.ReactNode, description?: string) => (
    <section className="space-y-3 border-b pb-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );

  const pdfHref = baseline.id ? `analysis/pdf?scenario=${baseline.id}` : null;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field id="uw-scenario" label="Scenario" className="min-w-0 flex-1">
              <NativeSelect
                id="uw-scenario"
                value={baseline.id ?? ""}
                onChange={(e) => switchTo(e.target.value || null)}
                data-testid="uw-scenario-select"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {!readOnly && <option value="">+ New scenario</option>}
              </NativeSelect>
            </Field>
            {!readOnly && (
              <Field id="uw-name" label="Name" error={err("name")} className="min-w-0 flex-1">
                <Input
                  id="uw-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="uw-name"
                />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Only what we know is filled in: price from the listing, units and size from the
            property, each with its source. Rents, vacancy, expenses and the loan are yours to enter
            — nothing is assumed.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Phones: the results card is far below, so keep the key numbers in view while typing. */}
          <dl
            className="sticky top-14 z-10 -mx-4 grid grid-cols-4 gap-1 border-y bg-background/95 px-2 py-1.5 text-center backdrop-blur sm:-mx-5 lg:hidden"
            aria-label="Key numbers"
            data-testid="uw-key-numbers"
          >
            {(["noi", "capRate", "dscr", "cashFlow"] as const).map((k) => (
              <div key={k} className="min-w-0">
                <dt className="truncate text-[10px] text-muted-foreground">
                  {k === "noi"
                    ? "NOI"
                    : k === "capRate"
                      ? "Cap rate"
                      : k === "dscr"
                        ? "DSCR"
                        : "Cash flow"}
                </dt>
                <dd className="truncate text-xs font-semibold tabular">
                  {result[k].value !== null ? formatMetric(result[k]) : "—"}
                </dd>
              </div>
            ))}
          </dl>
          {section(
            "Property",
            <>
              {numField("price", { prefix: "$" })}
              {numField("units")}
              {numField("buildingSqft")}
            </>,
          )}
          <section className="space-y-3 border-b pb-5">
            <div>
              <h3 className="text-sm font-bold">Income</h3>
              <p className="text-xs text-muted-foreground">
                Add unit types for the rent roll, or enter one total monthly rent.
              </p>
            </div>
            <div className="space-y-2" data-testid="uw-unit-mix">
              {form.mix.map((r, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-end gap-2">
                  <Field
                    id={`uw-mix-${idx}-label`}
                    label={idx === 0 ? "Unit type" : <span className="sr-only">Unit type</span>}
                    error={err(`unitMix.${idx}.label`)}
                  >
                    <Input
                      id={`uw-mix-${idx}-label`}
                      value={r.label}
                      placeholder="2BR/1BA"
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mix: f.mix.map((x, i) =>
                            i === idx ? { ...x, label: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </Field>
                  <Field
                    id={`uw-mix-${idx}-count`}
                    label={idx === 0 ? "Units" : <span className="sr-only">Units</span>}
                    error={err(`unitMix.${idx}.count`)}
                  >
                    <Input
                      id={`uw-mix-${idx}-count`}
                      inputMode="numeric"
                      value={r.count}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mix: f.mix.map((x, i) =>
                            i === idx ? { ...x, count: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </Field>
                  <Field
                    id={`uw-mix-${idx}-rent`}
                    label={
                      idx === 0 ? "Rent / mo" : <span className="sr-only">Rent per month</span>
                    }
                    error={err(`unitMix.${idx}.monthlyRent`)}
                  >
                    <Input
                      id={`uw-mix-${idx}-rent`}
                      inputMode="decimal"
                      value={r.monthlyRent}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mix: f.mix.map((x, i) =>
                            i === idx ? { ...x, monthlyRent: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </Field>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${r.label || "unit type"}`}
                      onClick={() =>
                        setForm((f) => ({ ...f, mix: f.mix.filter((_, i) => i !== idx) }))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      mix: [...f.mix, { label: "", count: "", monthlyRent: "" }],
                    }))
                  }
                  data-testid="uw-add-unit-type"
                >
                  <Plus aria-hidden /> Add unit type
                </Button>
              )}
              {form.mix.length > 0 && <div>{sourceFor("unitMix")}</div>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {form.mix.length === 0 && numField("monthlyRentTotal", { prefix: "$" })}
              {numField("otherIncomeMonthly", { prefix: "$" })}
              {numField("vacancyPct", { suffix: "%" })}
            </div>
          </section>
          <section className="space-y-3 border-b pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Expenses (annual)</h3>
              <div
                role="radiogroup"
                aria-label="Expense method"
                className="flex rounded-md border p-0.5 text-xs font-semibold"
              >
                {(["itemized", "ratio"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={form.mode === m}
                    disabled={readOnly}
                    onClick={() => setForm((f) => ({ ...f, mode: m }))}
                    className={cn(
                      "rounded px-2.5 py-1",
                      form.mode === m ? "bg-foreground text-background" : "hover:bg-muted",
                    )}
                    data-testid={`uw-mode-${m}`}
                  >
                    {m === "itemized" ? "Line by line" : "Expense ratio"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {form.mode === "itemized" ? (
                <>
                  {numField("taxRatePct", { suffix: "%" })}
                  {numField("insurance", { prefix: "$" })}
                  {numField("utilities", { prefix: "$" })}
                  {numField("repairs", { prefix: "$" })}
                  {numField("managementPct", { suffix: "%" })}
                  {numField("payroll", { prefix: "$" })}
                  {numField("otherExpenses", { prefix: "$" })}
                </>
              ) : (
                numField("expenseRatioPct", { suffix: "%" })
              )}
            </div>
          </section>
          {section(
            "Financing",
            <>
              {numField("ltvPct", { suffix: "%" })}
              {numField("interestRatePct", { suffix: "%" })}
              {numField("amortYears")}
              {numField("closingCosts", { prefix: "$" })}
            </>,
            "Enter 0% loan-to-value for an all-cash purchase.",
          )}
          <Field id="uw-notes" label="Notes">
            <Textarea
              id="uw-notes"
              value={form.notes}
              rows={3}
              disabled={readOnly}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
          {formError && (
            <p role="alert" className="text-sm font-medium text-brand-danger">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <>
                <Button
                  type="button"
                  onClick={() => save(false)}
                  disabled={!hydrated || pending || !dirty}
                  data-testid="uw-save"
                >
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  {baseline.id ? "Save changes" : "Save scenario"}
                </Button>
                {baseline.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => save(true)}
                    disabled={!hydrated || pending}
                  >
                    Save as new
                  </Button>
                )}
                {baseline.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={remove}
                    disabled={!hydrated || pending}
                  >
                    <Trash2 aria-hidden /> Delete
                  </Button>
                )}
              </>
            )}
            {pdfHref && !dirty ? (
              <Button asChild variant="outline">
                <Link href={pdfHref} prefetch={false} data-testid="uw-pdf">
                  <FileDown aria-hidden /> Download PDF
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {readOnly ? "" : "Save to download a PDF of exactly these numbers."}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5 lg:col-span-2">
        <FlagsCard flags={flags} />
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <p className="text-xs text-muted-foreground">
              Open any number to see how it was worked out.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-1" data-testid="uw-results">
            {METRIC_GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </h3>
                <ul className="divide-y rounded-md border">
                  {g.keys.map((k) => (
                    <MetricRow
                      key={k}
                      metric={result[k]}
                      inputs={inputs}
                      baseline={baseline}
                      isEdited={isEdited}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  inputs,
  baseline,
  isEdited,
}: {
  metric: Metric;
  inputs: UnderwritingInputs;
  baseline: Baseline;
  isEdited: (k: InputKey) => boolean;
}) {
  const used = metric.inputs.filter((k) => {
    const v = inputs[k];
    return k !== "expenseMode" && v !== null && !(Array.isArray(v) && v.length === 0);
  });
  return (
    <li data-testid={`uw-metric-${metric.key}`}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50">
          <span>{metric.label}</span>
          <span
            className={cn(
              "font-semibold tabular",
              metric.value === null && "text-muted-foreground",
            )}
            data-testid={`uw-value-${metric.key}`}
          >
            {metric.value !== null
              ? formatMetric(metric)
              : metric.missing.length
                ? "Needs input"
                : (metric.note ?? "—")}
          </span>
        </summary>
        <div className="space-y-1.5 border-t bg-muted/30 px-3 py-2 text-xs">
          <p>
            <span className="font-semibold">Formula:</span> {metric.formula}
          </p>
          {metric.missing.length > 0 && (
            <p className="text-brand-accent-text">
              <span className="font-semibold">Needs:</span>{" "}
              {metric.missing.map((k) => INPUT_LABELS[k]).join(", ")}
            </p>
          )}
          {used.length > 0 && (
            <div>
              <p className="font-semibold">Based on:</p>
              <ul className="mt-1 space-y-1">
                {used.map((k) => (
                  <li key={k} className="flex flex-wrap items-center gap-1.5">
                    <span>{INPUT_LABELS[k]}</span>
                    {isEdited(k) ? (
                      <span className="text-muted-foreground">(edited, not saved yet)</span>
                    ) : (
                      <SourceChip source={baseline.sources[k]} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

const FLAG_STYLE = {
  danger: { icon: ShieldAlert, cls: "border-red-300 bg-red-50 text-red-950", label: "Problem" },
  warning: {
    icon: AlertTriangle,
    cls: "border-amber-300 bg-amber-50 text-amber-950",
    label: "Check",
  },
  info: { icon: Info, cls: "border-sky-300 bg-sky-50 text-sky-950", label: "Note" },
} as const;

function FlagsCard({ flags }: { flags: RedFlag[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Red flags</CardTitle>
      </CardHeader>
      <CardContent className="pt-1" data-testid="uw-flags">
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing flagged with the numbers entered so far.
          </p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => {
              const s = FLAG_STYLE[f.level];
              const Icon = s.icon;
              return (
                <li
                  key={f.id}
                  className={cn("flex gap-2 rounded-md border p-2.5 text-sm", s.cls)}
                  data-testid={`uw-flag-${f.id}`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">
                      <span className="sr-only">{s.label}: </span>
                      {f.title}
                    </p>
                    <p className="text-xs">{f.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
