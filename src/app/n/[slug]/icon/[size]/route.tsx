import { ImageResponse } from "next/og";

import { parseBrand } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

const SIZES = new Set([180, 192, 512]);

/** PNG app icon (home screen / install), drawn in the workspace's brand colours. */
export async function GET(_req: Request, { params }: RouteContext<"/n/[slug]/icon/[size]">) {
  const { slug, size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("network_brand", { p_slug: slug });
  const row = data?.[0];
  if (!row) return new Response("Not found", { status: 404 });
  const brand = parseBrand(row.brand);
  const letters = (brand.logoText ?? row.workspace_name.slice(0, 3)).toUpperCase().slice(0, 4);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brand.primary,
        color: "#FFFFFF",
        fontSize: size * (letters.length > 3 ? 0.26 : 0.32),
        fontWeight: 800,
        letterSpacing: -1,
      }}
    >
      {letters}
      <div
        style={{
          position: "absolute",
          bottom: size * 0.16,
          width: size * 0.3,
          height: size * 0.05,
          borderRadius: size * 0.03,
          background: brand.accent,
        }}
      />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
