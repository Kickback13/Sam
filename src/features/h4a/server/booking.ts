"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { createClient } from "@/lib/supabase/server";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import {
  blockSchema,
  bookingSettingsSchema,
  DAYS,
  parseHours,
  publicBookingSchema,
} from "../booking/booking";
import { BOOKING_TEXT, bookingError, type BookingLang } from "../booking/i18n";

const ADMIN_ONLY = "Only an owner or admin can change the booking page.";

/** Owner/admin: booking page settings (stays off until switched on). */
export async function saveBookingSettings(
  input: z.input<typeof bookingSettingsSchema>,
): Promise<ActionResult> {
  const parsed = bookingSettingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check the form", fieldErrors: zodFieldErrors(parsed.error) };
  const v = parsed.data;
  const hours = parseHours(v.hours);
  if (
    Object.keys(v.hours).some((k) => !DAYS.some((d) => d.key === k)) ||
    Object.values(v.hours).some((rs) => rs.some(([a, b]) => !(a < b)))
  )
    return { ok: false, error: "Closing time must be after opening time" };
  if (v.enabled && Object.keys(hours).length === 0)
    return { ok: false, error: "Tick at least one day before switching the page on" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const created = await ctx.supabase
    .from("booking_settings")
    .upsert(
      { workspace_id: v.workspaceId },
      { onConflict: "workspace_id", ignoreDuplicates: true },
    );
  if (created.error)
    return {
      ok: false,
      error: created.error.code === "42501" ? ADMIN_ONLY : friendlyDbError(created.error),
    };
  const { data, error } = await ctx.supabase
    .from("booking_settings")
    .update({
      enabled: v.enabled,
      host_user_id: v.hostUserId,
      title: v.title,
      intro: v.intro || null,
      location: v.location,
      meeting_minutes: v.meetingMinutes,
      buffer_minutes: v.bufferMinutes,
      min_notice_hours: v.minNoticeHours,
      max_days_ahead: v.maxDaysAhead,
      time_zone: v.timeZone,
      hours: toJson(hours),
      updated_by: ctx.user.id,
    })
    .eq("workspace_id", v.workspaceId)
    .select("workspace_id");
  if (error)
    return { ok: false, error: error.code === "42501" ? ADMIN_ONLY : friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: ADMIN_ONLY };
  await writeAudit(ctx.supabase, {
    workspaceId: v.workspaceId,
    actorId: ctx.user.id,
    action: "booking.settings_saved",
    entityType: "booking",
    diff: { enabled: v.enabled, meeting_minutes: v.meetingMinutes },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/** Owner/admin: a new private calendar-feed link (the old one stops working). Shown once. */
export async function rotateCalendarFeed(input: {
  workspaceId: string;
}): Promise<ActionResult<{ token: string }>> {
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase.rpc("booking_rotate_feed", {
    p_workspace_id: ws.data,
  });
  if (error || !data)
    return { ok: false, error: error?.code === "42501" ? ADMIN_ONLY : friendlyDbError(error) };
  revalidateWorkspace();
  return { ok: true, data: { token: data } };
}

/** Writers: block time so nobody can book it (e.g. a showing that isn't in the app). */
export async function blockTime(input: z.input<typeof blockSchema>): Promise<ActionResult> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const v = parsed.data;
  const { data, error } = await ctx.supabase
    .from("bookings")
    .insert({
      workspace_id: v.workspaceId,
      kind: "block",
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      title: v.title || "Busy",
      source: "staff",
      created_by: ctx.user.id,
      host_user_id: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await writeAudit(ctx.supabase, {
    workspaceId: v.workspaceId,
    actorId: ctx.user.id,
    action: "booking.blocked",
    entityType: "booking",
    entityId: data.id,
    diff: { starts_at: v.startsAt, ends_at: v.endsAt },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const statusSchema = z.object({
  workspaceId: z.uuid(),
  bookingId: z.uuid(),
  status: z.enum(["booked", "completed", "no_show", "canceled"]),
});

/** Writers: mark a booking completed / no-show, cancel it, or remove a block (cancel). */
export async function setBookingStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, bookingId, status } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("bookings")
    .update({ status, canceled_at: status === "canceled" ? new Date().toISOString() : null })
    .eq("workspace_id", workspaceId)
    .eq("id", bookingId)
    .select("id, contact_id, kind, starts_at")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data) return { ok: false, error: "Booking not found." };
  if (data.kind === "meeting" && data.contact_id && status !== "booked") {
    const words = { completed: "completed", no_show: "marked no-show", canceled: "canceled" };
    const { error: actErr } = await ctx.supabase.from("activities").insert({
      workspace_id: workspaceId,
      type: "meeting",
      subject_type: "contact",
      subject_id: data.contact_id,
      body: `Booked call ${words[status]}`,
      metadata: toJson({ event: "booking_status", booking_id: bookingId, status }),
      created_by: ctx.user.id,
    });
    if (actErr) console.error("booking activity insert failed", { code: actErr.code });
  }
  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: "booking.status_changed",
    entityType: "booking",
    entityId: bookingId,
    diff: { status },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

/** Salted, daily-rotating hash of the booker's IP, used only for rate limiting. */
async function clientKey(slug: string): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`booking:${slug}:${day}:${ip}`).digest("hex");
}

export type PublicBookingResult = { bookingId: string; startsAt: string; endsAt: string };

/** Public booking page (no sign-in). The database function re-checks the slot and limits. */
export async function bookPublicSlot(
  input: z.input<typeof publicBookingSchema>,
): Promise<ActionResult<PublicBookingResult>> {
  const lang: BookingLang = input?.language === "es" ? "es" : "en";
  const parsed = publicBookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(zodFieldErrors(parsed.error)).map(([k, msgs]) => [
        k,
        (msgs ?? []).map((m) => bookingError(m, lang)),
      ]),
    );
    return {
      ok: false,
      error: bookingError(parsed.error.issues[0]?.message ?? "Check the form", lang),
      fieldErrors,
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_public_book", {
    p_slug: v.slug,
    p_starts_at: v.startsAt,
    p_name: v.name,
    p_email: v.email,
    p_phone: v.phone,
    p_note: v.note,
    p_client_key: (await clientKey(v.slug)) as string,
    p_language: v.language,
  });
  if (error) {
    // Our own messages (validation, taken slot, limits) are safe to show.
    if (["22023", "PT404", "PT409", "PT429"].includes(error.code ?? ""))
      return { ok: false, error: bookingError(error.message, lang) };
    console.error("booking_public_book failed", { code: error.code });
    return { ok: false, error: BOOKING_TEXT[lang].genericError };
  }
  const row = data?.[0];
  if (!row) return { ok: false, error: BOOKING_TEXT[lang].genericError };
  return {
    ok: true,
    data: { bookingId: row.booking_id, startsAt: row.starts_at, endsAt: row.ends_at },
  };
}
