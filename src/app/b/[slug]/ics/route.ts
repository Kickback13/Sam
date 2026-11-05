import { buildIcs } from "@/features/h4a/booking/booking";
import { BOOKING_TEXT } from "@/features/h4a/booking/i18n";
import { getPublicBookingPage } from "@/features/h4a/server/booking-queries";

/** The lead's "add to my calendar" file. Built from the public page text and the chosen time. */
export async function GET(request: Request, ctx: RouteContext<"/b/[slug]/ics">) {
  const { slug } = await ctx.params;
  const page = await getPublicBookingPage(slug);
  if (!page) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const t = BOOKING_TEXT[url.searchParams.get("lang") === "es" ? "es" : "en"];
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s || e - s > 24 * 3600 * 1000)
    return new Response("Invalid time", { status: 400 });
  const ics = buildIcs(
    [
      {
        uid: `${s}-${slug}@booking`,
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        summary: `${page.title} — ${page.workspaceName}`,
        description: page.hostName ? t.with(page.hostName) : null,
        location: page.location,
      },
    ],
    { name: page.workspaceName },
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-call.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
