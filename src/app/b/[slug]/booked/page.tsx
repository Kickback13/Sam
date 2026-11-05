import { CalendarPlus, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatSlotLong } from "@/features/h4a/booking/booking";
import { BookingFacts, BookingShell } from "@/features/h4a/components/booking/public-booking";
import { getPublicBookingPage } from "@/features/h4a/server/booking-queries";

export const metadata: Metadata = { title: "You're booked" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BookedPage({ params, searchParams }: PageProps<"/b/[slug]/booked">) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = await getPublicBookingPage(slug);
  if (!page) notFound();
  const start = one(sp.start);
  const end = one(sp.end);
  const valid = start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end));
  return (
    <BookingShell page={page}>
      <p className="flex items-center gap-2 text-2xl font-bold" data-testid="booked">
        <CheckCircle2 className="size-6 text-brand-accent-text" aria-hidden /> You&apos;re booked
      </p>
      {valid && (
        <p className="mt-2 text-lg font-semibold" data-testid="booked-time">
          {formatSlotLong(start, page.timeZone)}
        </p>
      )}
      <BookingFacts page={page} />
      <p className="mt-4 text-muted-foreground">
        {page.hostName ?? "We"} will reach out at the time you picked. No confirmation email is
        sent, so add it to your calendar now.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {valid && (
          <Button asChild>
            <a
              href={`/b/${slug}/ics?${new URLSearchParams({ start, end })}`}
              data-testid="add-to-calendar"
            >
              <CalendarPlus aria-hidden /> Add to my calendar
            </a>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/b/${slug}`}>Book another time</Link>
        </Button>
      </div>
    </BookingShell>
  );
}
