"use client";

import { Copy, Download, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { ESTIMATE_STATUSES, type EstimateStatus } from "../constants";
import { estimateTotals } from "../estimates/math";
import { formatMoney } from "../format";
import {
  createEstimate,
  deleteEstimate,
  duplicateEstimate,
  saveEstimate,
  setEstimateStatus,
} from "../server/actions/estimates";
import type { EstimateItemRow, EstimateRow } from "../server/queries";

export const STATUS_BADGE: Record<string, "secondary" | "info" | "success" | "danger"> = {
  draft: "secondary",
  sent: "info",
  accepted: "success",
  declined: "danger",
};

type Line = { key: string; description: string; qty: string; unit: string; unit_price: string };

let lineSeq = 0;
const newLine = (partial: Partial<Line> = {}): Line => ({
  key: `l${++lineSeq}`,
  description: "",
  qty: "1",
  unit: "",
  unit_price: "",
  ...partial,
});

export function EstimatesPanel({
  dealId,
  basePath,
  estimates,
  selected,
}: {
  dealId: string;
  basePath: string;
  estimates: EstimateRow[];
  selected: { estimate: EstimateRow; items: EstimateItemRow[] } | null;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [creating, startCreating] = useTransition();

  function create() {
    startCreating(async () => {
      const result = await createEstimate({ workspaceId: ws.id, dealId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`${basePath}?tab=estimates&estimate=${result.data.id}`, { scroll: false });
      router.refresh();
    });
  }

  if (estimates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No estimates yet"
        description="Build a line-item estimate with markup and tax, then download it as a branded PDF."
        actions={
          ws.canWrite && (
            <Button onClick={create} disabled={creating} data-testid="new-estimate">
              {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}{" "}
              New estimate
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        {ws.canWrite && (
          <Button
            onClick={create}
            disabled={creating}
            variant="outline"
            className="w-full"
            data-testid="new-estimate"
          >
            {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} New
            estimate
          </Button>
        )}
        <ul className="space-y-2" aria-label="Estimate versions">
          {estimates.map((e) => (
            <li key={e.id}>
              <Link
                href={`${basePath}?tab=estimates&estimate=${e.id}`}
                scroll={false}
                aria-current={selected?.estimate.id === e.id ? "true" : undefined}
                className={cn(
                  "block rounded-lg border bg-card px-3 py-2 text-sm hover:border-foreground/30",
                  selected?.estimate.id === e.id && "border-brand-ink ring-1 ring-brand-ink",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">
                    v{e.version} · {e.title}
                  </span>
                  <Badge variant={STATUS_BADGE[e.status]}>{e.status}</Badge>
                </span>
                <span className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {e.status === "accepted"
                      ? `Accepted ${formatDate(e.accepted_on)}`
                      : e.status === "declined"
                        ? `Declined ${formatDate(e.declined_on)}`
                        : e.status === "sent"
                          ? `Sent ${formatDate(e.sent_on)}`
                          : `Updated ${formatDate(e.updated_at)}`}
                  </span>
                  <span className="font-semibold text-foreground tabular">
                    {formatMoney(e.total)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {selected ? (
        <EstimateEditor
          key={`${selected.estimate.id}-${selected.estimate.updated_at}`}
          basePath={basePath}
          {...selected}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Pick a version to view or edit it.
        </p>
      )}
    </div>
  );
}

function EstimateEditor({
  estimate,
  items,
  basePath,
}: {
  estimate: EstimateRow;
  items: EstimateItemRow[];
  basePath: string;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const editable = ws.canWrite && estimate.status === "draft";
  const [title, setTitle] = useState(estimate.title);
  const [markup, setMarkup] = useState(String(estimate.markup_pct ?? 0));
  const [tax, setTax] = useState(String(estimate.tax_pct ?? 0));
  const [validUntil, setValidUntil] = useState(estimate.valid_until ?? "");
  const [notes, setNotes] = useState(estimate.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    items.length
      ? items.map((i) =>
          newLine({
            description: i.description,
            qty: String(i.qty),
            unit: i.unit ?? "",
            unit_price: String(i.unit_price),
          }),
        )
      : [newLine()],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, startBusy] = useTransition();

  const filled = lines.filter((l) => l.description.trim() || l.unit_price.trim());
  const totals = estimateTotals(
    filled.map((l) => ({ qty: l.qty, unitPrice: l.unit_price.replace(/[$,\s]/g, "") })),
    markup,
    tax,
  );

  const update = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startBusy(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startBusy(async () => {
      const result = await saveEstimate({
        workspaceId: ws.id,
        estimateId: estimate.id,
        estimate: {
          title,
          markup_pct: markup,
          tax_pct: tax,
          valid_until: validUntil,
          notes,
          items: filled.map((l) => ({
            description: l.description,
            qty: l.qty,
            unit: l.unit,
            unit_price: l.unit_price,
          })),
        },
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success(`Estimate saved · ${formatMoney(result.data.total)}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="estimate-editor"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">
          Version {estimate.version}
          {estimate.revised_from && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">(revision)</span>
          )}
        </h2>
        <Button asChild size="sm" variant="outline">
          <a href={`${basePath}/estimates/${estimate.id}/pdf`} download data-testid="estimate-pdf">
            <Download aria-hidden /> Download PDF
          </a>
        </Button>
        {ws.canWrite && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="duplicate-estimate"
            onClick={() =>
              startBusy(async () => {
                const result = await duplicateEstimate({
                  workspaceId: ws.id,
                  estimateId: estimate.id,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`Version ${result.data.version} created as a draft`);
                router.push(`${basePath}?tab=estimates&estimate=${result.data.id}`, {
                  scroll: false,
                });
                router.refresh();
              })
            }
          >
            <Copy aria-hidden /> Duplicate to revise
          </Button>
        )}
      </div>

      {ws.canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="estimate-status" className="text-sm">
            Status
          </Label>
          <NativeSelect
            id="estimate-status"
            className="w-44"
            value={estimate.status}
            disabled={busy}
            onChange={(e) =>
              run(
                () =>
                  setEstimateStatus({
                    workspaceId: ws.id,
                    estimateId: estimate.id,
                    status: e.target.value as EstimateStatus,
                  }),
                "Status updated",
              )
            }
          >
            {ESTIMATE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">
            {[
              estimate.sent_on && `Sent ${formatDate(estimate.sent_on)}`,
              estimate.accepted_on && `Accepted ${formatDate(estimate.accepted_on)}`,
              estimate.declined_on && `Declined ${formatDate(estimate.declined_on)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      )}
      {!editable && ws.canWrite && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This version is {estimate.status}, so it&apos;s locked. Use “Duplicate to revise” to make
          changes.
        </p>
      )}

      <fieldset disabled={!editable} className="space-y-4">
        <Field id="estimate-title" label="Title" error={errors.title?.[0]}>
          <Input id="estimate-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <div>
          <div className="hidden grid-cols-[1fr_80px_80px_110px_110px_36px] gap-2 px-1 pb-1 text-xs font-semibold text-muted-foreground uppercase sm:grid">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Unit price</span>
            <span className="text-right">Line total</span>
            <span />
          </div>
          <ul className="space-y-2" aria-label="Line items">
            {lines.map((l, i) => (
              <li
                key={l.key}
                className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_80px_80px_110px_110px_36px] sm:border-0 sm:p-0"
                data-testid="estimate-line"
              >
                <Input
                  aria-label={`Line ${i + 1} description`}
                  className="col-span-2 sm:col-span-1"
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => update(l.key, { description: e.target.value })}
                  aria-invalid={Boolean(errors[`items.${i}.description`])}
                />
                <Input
                  aria-label={`Line ${i + 1} quantity`}
                  inputMode="decimal"
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                />
                <Input
                  aria-label={`Line ${i + 1} unit`}
                  placeholder="sq ft, hr…"
                  value={l.unit}
                  onChange={(e) => update(l.key, { unit: e.target.value })}
                />
                <Input
                  aria-label={`Line ${i + 1} unit price`}
                  inputMode="decimal"
                  placeholder="$0.00"
                  value={l.unit_price}
                  onChange={(e) => update(l.key, { unit_price: e.target.value })}
                />
                <span className="flex items-center justify-end text-sm font-semibold tabular">
                  {formatMoney(
                    estimateTotals([{ qty: l.qty, unitPrice: l.unit_price.replace(/[$,\s]/g, "") }])
                      .subtotal,
                  )}
                </span>
                {editable && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() =>
                      setLines((prev) =>
                        prev.length > 1 ? prev.filter((x) => x.key !== l.key) : [newLine()],
                      )
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {Object.keys(errors).some((k) => k.startsWith("items")) && (
            <p role="alert" className="mt-1 text-xs font-medium text-brand-danger">
              Every line needs a description, and numbers must be 0 or more.
            </p>
          )}
          {editable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setLines((p) => [...p, newLine()])}
              data-testid="add-line"
            >
              <Plus aria-hidden /> Add line
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <Field id="markup" label="Markup %" error={errors.markup_pct?.[0]}>
              <Input
                id="markup"
                inputMode="decimal"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
              />
            </Field>
            <Field id="tax" label="Tax %" error={errors.tax_pct?.[0]}>
              <Input
                id="tax"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </Field>
            <Field id="valid-until" label="Valid until" className="col-span-2">
              <Input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </Field>
          </div>
          <dl
            className="space-y-1 rounded-lg bg-muted px-4 py-3 text-sm"
            data-testid="estimate-totals"
            aria-live="polite"
          >
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular">{formatMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Markup</dt>
              <dd className="tabular">{formatMoney(totals.markup)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="tabular">{formatMoney(totals.tax)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular" data-testid="estimate-total-value">
                {formatMoney(totals.total)}
              </dd>
            </div>
          </dl>
        </div>

        <Field id="estimate-notes" label="Notes / terms" help="Printed at the bottom of the PDF.">
          <Textarea
            id="estimate-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </fieldset>

      {editable && (
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            className="text-brand-danger"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                const result = await deleteEstimate({
                  workspaceId: ws.id,
                  estimateId: estimate.id,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Draft deleted");
                router.push(`${basePath}?tab=estimates`, { scroll: false });
                router.refresh();
              })
            }
          >
            <Trash2 aria-hidden /> Delete draft
          </Button>
          <Button type="submit" disabled={!hydrated || busy} data-testid="save-estimate">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
            estimate
          </Button>
        </div>
      )}
    </form>
  );
}
