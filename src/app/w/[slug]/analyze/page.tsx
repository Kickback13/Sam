import { AlertTriangle, Calculator, Info, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { listAnalyses } from "@/features/h4a/server/analysis";
import { redFlags } from "@/features/h4a/underwriting/flags";
import { formatMetric } from "@/features/h4a/underwriting/format";
import { underwrite, type MetricKey } from "@/features/h4a/underwriting/math";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analyze" };

const KEY_METRICS: { key: MetricKey; label: string }[] = [
  { key: "pricePerUnit", label: "Price / unit" },
  { key: "capRate", label: "Cap rate" },
  { key: "dscr", label: "DSCR" },
  { key: "cashFlow", label: "Cash flow" },
];

/** Every property with a saved analysis: key numbers and red flags from its latest scenario. */
export default async function AnalyzePage({ params }: PageProps<"/w/[slug]/analyze">) {
  const { slug } = await params;
  const { workspace } = await getRealEstateContext(slug);
  const rows = (await listAnalyses(workspace.id)).map((r) => {
    const result = underwrite(r.inputs);
    return { ...r, result, flags: redFlags(r.inputs, result, r.flagContext) };
  });

  return (
    <>
      <PageHeader
        title="Analyze"
        description="Every property with a saved analysis, using its most recently saved scenario. Start a new one from any property with “Analyze deal”."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/w/${slug}/properties`}>Choose a property</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No analyses yet"
          description="Open a property and click “Analyze deal” to underwrite it. Saved scenarios show up here."
          actions={
            <Button asChild size="sm">
              <Link href={`/w/${slug}/properties`}>Go to properties</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="analysis-list">
          {rows.map((r) => {
            const danger = r.flags.filter((f) => f.level === "danger").length;
            const warning = r.flags.filter((f) => f.level === "warning").length;
            const top = r.flags[0];
            return (
              <li
                key={r.propertyId}
                className="rounded-xl border bg-card p-4"
                data-testid="analysis-row"
                data-address={r.address}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/w/${slug}/properties/${r.propertyId}/analysis?scenario=${r.scenarioId}`}
                      className="font-semibold hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.address}
                      {r.units ? ` · ${formatNumber(r.units)} units` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      “{r.scenarioName}”
                      {r.scenarioCount > 1 ? ` (+${r.scenarioCount - 1} more)` : ""} · saved{" "}
                      {formatDate(r.updatedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5 text-xs font-semibold">
                    {danger > 0 && (
                      <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-red-950">
                        <ShieldAlert className="size-3.5" aria-hidden /> {danger} problem
                        {danger === 1 ? "" : "s"}
                      </span>
                    )}
                    {warning > 0 && (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-950">
                        <AlertTriangle className="size-3.5" aria-hidden /> {warning} to check
                      </span>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {KEY_METRICS.map(({ key, label }) => {
                    const m = r.result[key];
                    return (
                      <div key={key} className="rounded-md bg-muted/50 px-2.5 py-1.5">
                        <dt className="text-[11px] text-muted-foreground">{label}</dt>
                        <dd
                          className={cn(
                            "text-sm font-semibold tabular",
                            m.value === null && "text-muted-foreground",
                          )}
                          data-testid={`analysis-${key}`}
                        >
                          {m.value !== null
                            ? formatMetric(m)
                            : m.missing.length
                              ? "Needs input"
                              : (m.note ?? "—")}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {top && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold text-foreground">{top.title}.</span>{" "}
                      {top.detail}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
