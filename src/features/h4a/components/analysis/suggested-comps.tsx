"use client";

import { Loader2, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

import type { CompSuggestion } from "../../comps/suggest";
import type { CompSuggestions } from "../../server/comp-suggestions";
import { addSuggestedComps } from "../../server/actions/analysis";

const ORIGIN_LABEL: Record<CompSuggestion["origin"], string> = {
  recorded_sale: "Sale on file",
  saved_comp: "Comp on another property",
  rentcast: "RentCast comparable",
};

function nearText(s: CompSuggestion): string {
  if (s.nearness.type === "miles") return `${s.nearness.miles.toFixed(1)} mi away`;
  if (s.nearness.type === "zip") return `Same ZIP ${s.nearness.zip}`;
  return `Same city`;
}

export function SuggestedComps({
  propertyId,
  suggestions,
}: {
  propertyId: string;
  suggestions: CompSuggestions;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const all = [...suggestions.sale, ...suggestions.rent];
  const { recordedSales, savedComps, rentcastComparables } = suggestions.scanned;

  const add = (keys: string[]) =>
    start(async () => {
      const r = await addSuggestedComps({ workspaceId: ws.id, propertyId, keys });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data.added === 1 ? "Comp added" : `${r.data.added} comps added`);
      router.refresh();
    });

  const row = (s: CompSuggestion) => (
    <li
      key={s.key}
      className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
      data-testid="suggested-comp"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold break-words">{s.address}</p>
        <p className="text-xs tabular">
          {s.kind === "sale" ? (
            <>
              {formatCurrency(s.price)}
              {s.units
                ? ` · ${formatNumber(s.units)} units · ${formatCurrency(s.price_per_unit)}/unit`
                : ""}
              {s.sale_date ? ` · sold ${formatDate(s.sale_date)}` : " · list price"}
            </>
          ) : (
            <>
              {s.unit_type ? `${s.unit_type} · ` : ""}
              {formatCurrency(s.monthly_rent)}/mo
            </>
          )}
        </p>
        <p className="flex flex-wrap gap-1 text-[11px]">
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{nearText(s)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">{ORIGIN_LABEL[s.origin]}</span>
          <span
            className="rounded bg-muted px-1.5 py-0.5 tabular"
            title="Location, size and recency"
          >
            Match {s.score}
          </span>
        </p>
        <p className="text-[11px] break-words text-muted-foreground">
          {s.source_label} <span aria-hidden>·</span> as of {formatDate(s.as_of)}
        </p>
      </div>
      {ws.canWrite && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => add([s.key])}
          disabled={!hydrated || pending}
          aria-label={`Add ${s.kind} comp ${s.address}`}
          data-testid="suggested-comp-add"
        >
          <Plus aria-hidden /> Add
        </Button>
      )}
    </li>
  );

  return (
    <section
      className="space-y-2"
      aria-labelledby="suggested-comps-title"
      data-testid="suggested-comps"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="suggested-comps-title"
          className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <Sparkles className="size-3.5" aria-hidden /> Suggested comps
        </h3>
        {ws.canWrite && all.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => add(all.map((s) => s.key))}
            disabled={!hydrated || pending}
            data-testid="suggested-comps-add-all"
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />} Add all {all.length}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Found in this workspace: sales on file for other properties, comps saved on other
        properties, and comparables in RentCast estimates already fetched here. Nearby (within 3 mi,
        else same ZIP or city), similar size, sold in the last 3 years. Nothing is added until you
        add it.
      </p>
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="suggested-comps-empty">
          {recordedSales + savedComps + rentcastComparables === 0
            ? "Nothing to compare with yet. Suggestions appear once other properties have a sale price and date on file, or comps are saved elsewhere."
            : "Nothing close enough yet."}
        </p>
      ) : (
        <>
          {suggestions.sale.length > 0 && (
            <ul className="divide-y rounded-md border" aria-label="Suggested sale comps">
              {suggestions.sale.map(row)}
            </ul>
          )}
          {suggestions.rent.length > 0 && (
            <ul className="divide-y rounded-md border" aria-label="Suggested rent comps">
              {suggestions.rent.map(row)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
