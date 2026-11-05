import type { Metadata } from "next";
import { headers } from "next/headers";

import { PageHeader } from "@/components/common/page-header";
import {
  BlockTimeForm,
  BookingLinks,
  BookingList,
  BookingSettingsForm,
} from "@/features/h4a/components/booking/booking-staff";
import { localDayKey } from "@/features/h4a/booking/booking";
import { getBookings, getBookingSettings } from "@/features/h4a/server/booking-queries";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { getMembers } from "@/server/queries/members";

export const metadata: Metadata = { title: "Calendar" };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Coming up: from two hours ago to 120 days out. Recent: the 14 days before that. */
function ranges(now = new Date()) {
  const at = (hours: number) => new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  return {
    upcoming: { from: at(-2), to: at(120 * 24) },
    recent: { from: at(-14 * 24), to: at(-2) },
  };
}

export default async function CalendarPage({ params }: PageProps<"/w/[slug]/calendar">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getRealEstateContext(slug);
  const range = ranges();
  const [settings, upcoming, recent, members, base] = await Promise.all([
    getBookingSettings(workspace.id),
    getBookings(workspace.id, range.upcoming),
    getBookings(workspace.id, range.recent),
    isAdmin ? getMembers(workspace.id) : Promise.resolve([]),
    origin(),
  ]);
  const timeZone = settings?.time_zone ?? "America/Los_Angeles";
  const active = upcoming.filter((b) => b.status !== "canceled");

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Calls leads booked on your booking page, plus time you blocked. Stored in the app: no calendar account is connected and nothing is sent to anyone."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Coming up</h2>
            <BlockTimeForm timeZone={timeZone} today={localDayKey(new Date(), timeZone)} />
            <BookingList
              items={active}
              timeZone={timeZone}
              emptyText="Nothing booked yet. Share your booking link to start getting calls."
            />
          </section>
          {recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Last 14 days</h2>
              <BookingList items={[...recent].reverse()} timeZone={timeZone} emptyText="" />
            </section>
          )}
        </div>
        <div className="space-y-5">
          <BookingLinks
            publicUrl={`${base}/b/${slug}`}
            enabled={Boolean(settings?.enabled)}
            feedBase={`${base}/api/calendar`}
            hasFeed={Boolean(settings?.hasFeed)}
          />
          <BookingSettingsForm
            members={members.filter((m) => m.role !== "viewer")}
            initial={{
              enabled: settings?.enabled ?? false,
              hostUserId: settings?.host_user_id ?? null,
              title: settings?.title ?? "Book a call",
              intro: settings?.intro ?? "",
              location: settings?.location ?? "Phone call",
              meetingMinutes: settings?.meeting_minutes ?? 30,
              bufferMinutes: settings?.buffer_minutes ?? 0,
              minNoticeHours: settings?.min_notice_hours ?? 24,
              maxDaysAhead: settings?.max_days_ahead ?? 30,
              timeZone,
              hours: settings?.hours ?? {
                mon: [["09:00", "17:00"]],
                tue: [["09:00", "17:00"]],
                wed: [["09:00", "17:00"]],
                thu: [["09:00", "17:00"]],
                fri: [["09:00", "17:00"]],
              },
            }}
          />
        </div>
      </div>
    </>
  );
}
