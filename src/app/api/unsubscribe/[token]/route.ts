import { NextResponse } from "next/server";

import { unsubscribe } from "@/features/outreach/server/unsubscribe";

/**
 * POST /api/unsubscribe/{token}
 * - RFC 8058 one-click (mail apps POST "List-Unsubscribe=One-Click"): 200, no redirect.
 * - The button on /unsubscribe/{token} (field from=page): 303 back to the page.
 * GET never unsubscribes (link scanners pre-fetch links).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params;
  const form = await request.formData().catch(() => null);
  let ok = false;
  try {
    ok = await unsubscribe(token);
  } catch (err) {
    console.error("unsubscribe failed", err instanceof Error ? err.message : err);
    return new NextResponse("Something went wrong. Please try again.", { status: 500 });
  }
  if (form?.get("from") === "page") {
    return NextResponse.redirect(new URL(`/unsubscribe/${token}?done=1`, request.url), 303);
  }
  return new NextResponse(ok ? "Unsubscribed" : "Unknown link", { status: ok ? 200 : 404 });
}
