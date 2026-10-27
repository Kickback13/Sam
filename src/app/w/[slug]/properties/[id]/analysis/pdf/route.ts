import { analysisPdfResponse } from "@/features/h4a/server/analysis-pdf-response";

/** Download a saved scenario as a PDF (members only, via RLS). Same calculator as the screen. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/w/[slug]/properties/[id]/analysis/pdf">,
) {
  const { slug, id } = await ctx.params;
  const scenarioId = new URL(request.url).searchParams.get("scenario");
  return analysisPdfResponse(slug, id, scenarioId);
}
