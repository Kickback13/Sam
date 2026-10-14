import { estimatePdfResponse } from "@/features/azh/server/estimate-pdf-response";

/** Download an estimate as a branded PDF (members only, via RLS). Nothing is emailed. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/w/[slug]/projects/[id]/estimates/[estimateId]/pdf">,
) {
  const { slug, id, estimateId } = await ctx.params;
  return estimatePdfResponse(slug, id, estimateId);
}
