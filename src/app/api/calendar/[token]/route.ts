import { buildIcs } from "@/features/h4a/booking/booking";
import { createClient } from "@/lib/supabase/server";

/**
 * Private, read-only calendar feed of bookings and blocked time (subscribe in Google or
 * Apple Calendar). The URL token is the only key; only its SHA-256 is stored.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_feed", { p_token: token });
  if (error) {
    console.error("booking_feed failed", { code: error.code });
    return new Response("Unavailable", { status: 503 });
  }
  const rows = data ?? [];
  if (!rows.length) {
    // Unknown token and an empty calendar look the same from outside.
    return new Response(buildIcs([], { name: "Bookings" }), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const ics = buildIcs(
    rows.map((b) => ({
      uid: `${b.id}@booking`,
      start: b.starts_at,
      end: b.ends_at,
      summary:
        b.kind === "block"
          ? `Busy: ${b.title ?? "Blocked"}`
          : `${b.title ?? "Call"}: ${b.name ?? "Lead"}${b.status === "no_show" ? " (no-show)" : ""}`,
      description:
        b.kind === "block"
          ? null
          : [b.email && `Email: ${b.email}`, b.phone && `Phone: ${b.phone}`, b.note]
              .filter(Boolean)
              .join("\n") || null,
      location: b.kind === "block" ? null : b.location,
      status: b.status === "canceled" ? ("CANCELLED" as const) : ("CONFIRMED" as const),
      updated: b.updated_at,
    })),
    { name: `${rows[0].workspace_name} bookings` },
  );
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
