import { Database, PlugZap } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiSummaryCard } from "@/features/h4a/components/analysis/ai-summary-card";
import { AnalysisWorkbench } from "@/features/h4a/components/analysis/analysis-workbench";
import { CompsPanel } from "@/features/h4a/components/analysis/comps-panel";
import { aiSummaryAdapter } from "@/features/h4a/ai/summary";
import { propertyDataAdapter } from "@/features/h4a/property-data/adapter";
import { getAnalysisData } from "@/features/h4a/server/analysis";
import { getRealEstateContext } from "@/features/h4a/server/context";

export const metadata: Metadata = { title: "Deal analysis" };

export default async function AnalysisPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/properties/[id]/analysis">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const { workspace } = await getRealEstateContext(slug);
  const data = await getAnalysisData(workspace.id, id);
  if (!data) notFound();

  const requested = typeof sp.scenario === "string" ? sp.scenario : null;
  const initialScenarioId =
    requested && data.scenarios.some((s) => s.id === requested)
      ? requested
      : requested === null && data.scenarios.length
        ? data.scenarios[0].id
        : null;
  const p = data.property;
  const dataService = propertyDataAdapter();
  const ai = aiSummaryAdapter();

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/properties/${p.id}`, label: p.name ?? p.address }}
        title="Deal analysis"
        description={[p.address, p.city, p.zip].filter(Boolean).join(", ")}
      />
      <div className="space-y-5">
        <AnalysisWorkbench
          // Remount whenever the saved data changes so the form always matches the server.
          key={`${initialScenarioId ?? "new"}:${data.scenarios.map((s) => s.updatedAt).join(",")}`}
          propertyId={p.id}
          prefill={data.prefill}
          scenarios={data.scenarios}
          initialScenarioId={initialScenarioId}
          flagContext={{
            saleCompMedianPricePerUnit: data.compStats.saleMedianPricePerUnit,
            saleCompCount: data.compStats.saleCount,
            verificationStatus: data.listing?.verificationStatus ?? null,
          }}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <CompsPanel propertyId={p.id} comps={data.comps} stats={data.compStats} />
          <div className="space-y-5">
            <AiSummaryCard
              connected={ai.connected}
              propertyId={p.id}
              scenarioId={initialScenarioId}
            />
            <Card data-testid="property-data-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="size-4" aria-hidden /> Ownership, mortgage &amp; tax
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1 text-sm">
                {dataService.connected ? null : (
                  <>
                    <p className="inline-flex items-center gap-1.5 rounded border border-dashed px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      <PlugZap className="size-3.5" aria-hidden /> Not connected
                    </p>
                    <p className="text-muted-foreground">
                      Owner, loan, foreclosure and tax data come from a licensed data service. Sam
                      picks the provider (ATTOM, RentCast or PropertyRadar); until then nothing here
                      is filled in, and the analysis uses only the facts above.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
