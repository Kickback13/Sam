import { NextResponse } from "next/server";

import { parseBrand } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

import { communityTerms } from "@/features/network/terms";

/** Web-app manifest for the member app (fetched without cookies — public name + colours only). */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/n/[slug]/manifest.webmanifest">,
) {
  const { slug } = await params;
  const supabase = await createClient();
  const [{ data }, { data: kind }] = await Promise.all([
    supabase.rpc("network_brand", { p_slug: slug }),
    supabase.rpc("network_business_type", { p_slug: slug }),
  ]);
  const terms = communityTerms(kind);
  const row = data?.[0];
  if (!row) return new NextResponse("Not found", { status: 404 });
  const brand = parseBrand(row.brand);
  const name = `${row.workspace_name} ${terms.suffix}`;
  return NextResponse.json(
    {
      id: `/n/${slug}/`,
      name,
      short_name: row.workspace_name.slice(0, 12),
      description: `The ${row.workspace_name} community: ${terms.dealsLabel.toLowerCase()}, events and members.`,
      start_url: `/n/${slug}`,
      scope: `/n/${slug}/`,
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: brand.primary,
      icons: [
        { src: `/n/${slug}/icon/192`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/n/${slug}/icon/512`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/n/${slug}/icon/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
