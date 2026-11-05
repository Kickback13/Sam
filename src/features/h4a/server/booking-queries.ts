import "server-only";

import { cache } from "react";

import { parseBrand, type Brand } from "@/lib/brand";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

import { parseHours, type Hours, type Slot } from "../booking/booking";

export type BookingSettings = Omit<
  Database["public"]["Tables"]["booking_settings"]["Row"],
  "hours" | "feed_token_hash"
> & { hours: Hours; hasFeed: boolean };

export async function getBookingSettings(workspaceId: string): Promise<BookingSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { feed_token_hash, hours, ...rest } = data;
  return { ...rest, hours: parseHours(hours), hasFeed: Boolean(feed_token_hash) };
}

export type BookingItem = {
  id: string;
  kind: "meeting" | "block";
  status: string;
  startsAt: string;
  endsAt: string;
  title: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  source: string;
  contactId: string | null;
};

/** Bookings and blocks from `from` onward (and a short look back), soonest first. */
export async function getBookings(
  workspaceId: string,
  range: { from: string; to: string },
): Promise<BookingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, kind, status, starts_at, ends_at, title, name, email, phone, note, source, contact_id",
    )
    .eq("workspace_id", workspaceId)
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .order("starts_at")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    kind: b.kind as BookingItem["kind"],
    status: b.status,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    title: b.title,
    name: b.name,
    email: b.email,
    phone: b.phone,
    note: b.note,
    source: b.source,
    contactId: b.contact_id,
  }));
}

// ---------------------------------------------------------------------------
// Public page (anon; SECURITY DEFINER functions return nothing while the page is off)
// ---------------------------------------------------------------------------
export type PublicBookingPage = {
  slug: string;
  workspaceName: string;
  title: string;
  intro: string | null;
  location: string;
  meetingMinutes: number;
  timeZone: string;
  hostName: string | null;
  brand: Brand;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const getPublicBookingPage = cache(
  async (slug: string): Promise<PublicBookingPage | null> => {
    if (!SLUG.test(slug) || slug.length > 60) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("booking_public_page", { p_slug: slug });
    if (error) {
      console.error("booking_public_page failed", { code: error.code });
      return null;
    }
    const row = data?.[0];
    if (!row) return null;
    return {
      slug,
      workspaceName: row.workspace_name,
      title: row.title,
      intro: row.intro,
      location: row.location,
      meetingMinutes: row.meeting_minutes,
      timeZone: row.time_zone,
      hostName: row.host_name,
      brand: parseBrand(row.brand),
    };
  },
);

export async function getPublicSlots(slug: string): Promise<Slot[]> {
  if (!SLUG.test(slug)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_public_slots", { p_slug: slug });
  if (error) {
    console.error("booking_public_slots failed", { code: error.code });
    return [];
  }
  return (data ?? []).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at }));
}
