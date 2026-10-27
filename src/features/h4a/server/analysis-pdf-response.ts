import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

import { buildAnalysisPdf } from "../pdf/analysis-pdf";
import { redFlags } from "../underwriting/flags";
import { underwrite } from "../underwriting/math";
import { getAnalysisData } from "./analysis";

const notFound = () => new Response("Not found", { status: 404 });

export async function analysisPdfResponse(
  slug: string,
  propertyId: string,
  scenarioId: string | null,
) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in to download the analysis.", { status: 401 });
  if (!scenarioId || !/^[0-9a-f-]{36}$/i.test(scenarioId)) return notFound();

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, business_type, is_demo")
    .eq("slug", slug)
    .maybeSingle();
  if (!ws || ws.business_type !== "real_estate") return notFound();

  const data = await getAnalysisData(ws.id, propertyId);
  const scenario = data?.scenarios.find((s) => s.id === scenarioId);
  if (!data || !scenario) return notFound();

  const result = underwrite(scenario.inputs);
  const flags = redFlags(scenario.inputs, result, {
    saleCompMedianPricePerUnit: data.compStats.saleMedianPricePerUnit,
    saleCompCount: data.compStats.saleCount,
    verificationStatus: data.listing?.verificationStatus ?? null,
  });
  const p = data.property;
  const bytes = await buildAnalysisPdf({
    workspaceName: ws.name,
    isDemo: ws.is_demo,
    propertyTitle: p.name ?? p.address,
    propertyAddress: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
    scenarioName: scenario.name,
    savedAt: scenario.updatedAt,
    notes: scenario.notes,
    inputs: scenario.inputs,
    sources: scenario.sources,
    result,
    flags,
    comps: data.compStats,
    generatedAt: new Date().toISOString(),
  });

  const slugify = (s: string) =>
    s
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  const filename = `analysis-${slugify(p.name ?? p.address) || "property"}-${slugify(scenario.name) || "scenario"}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
