import { NextResponse, type NextRequest } from "next/server";

import { toCsv } from "@/lib/csv/dedupe";
import { createClient } from "@/lib/supabase/server";

/** Downloadable error report for a past import (RLS limits it to workspace members). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/w/[slug]/people/import/[id]/errors">) {
  const { slug, id } = await ctx.params;
  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) return new NextResponse("Not found", { status: 404 });
  const { data: job } = await supabase
    .from("imports")
    .select("filename, errors")
    .eq("workspace_id", ws.id)
    .eq("id", id)
    .maybeSingle();
  if (!job) return new NextResponse("Not found", { status: 404 });

  const errors = (Array.isArray(job.errors) ? job.errors : []) as { row: number; message: string; data?: Record<string, string> }[];
  const columns = [...new Set(errors.flatMap((e) => Object.keys(e.data ?? {})))];
  const csv = toCsv(
    ["row", "error", ...columns],
    errors.map((e) => [e.row, e.message, ...columns.map((c) => e.data?.[c] ?? "")]),
  );
  const name = (job.filename ?? "import").replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-errors.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
