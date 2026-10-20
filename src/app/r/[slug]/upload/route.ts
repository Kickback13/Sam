import { issueUploadSlots } from "@/features/azh/server/upload-route";

/** Signed photo-upload slots for the public request form (no login). */
export async function POST(request: Request, ctx: RouteContext<"/r/[slug]/upload">) {
  const { slug } = await ctx.params;
  return issueUploadSlots(slug, request);
}
