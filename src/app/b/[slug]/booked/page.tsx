import { CalendarPlus, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatSlotLong } from "@/features/h4a/booking/booking";
import { BOOKING_LOCALE, BOOKING_TEXT, pickBookingLang } from "@/features/h4a/booking/i18n";
import { BookingFacts, BookingShell } from "@/features/h4a/components/booking/public-booking";
import { getPublicBookingPage } from "@/features/h4a/server/booking-queries";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({
  searchParams,
}: PageProps<"/b/[slug]/booked">): Promise<Metadata> {
  const lang = pickBookingLang((await searchParams).lang, (await headers()).get("accept-language"));
  return { title: BOOKING_TEXT[lang].bookedTitle };
}

export default async function BookedPage({ params, searchParams }: PageProps<"/b/[slug]/booked">) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = pickBookingLang(sp.lang, (await headers()).get("accept-language"));
  const t = BOOKING_TEXT[lang];
  const page = await getPublicBookingPage(slug);
  if (!page) notFound();
  const start = one(sp.start);
  const end = one(sp.end);
  const valid = start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end));
  return (
    <BookingShell
      page={page}
      lang={lang}
      switchHref={`/b/${slug}/booked?${new URLSearchParams({
        ...(start ? { start } : {}),
        ...(end ? { end } : {}),
        lang: t.switchLang,
      })}`}
    >
      <p className="flex items-center gap-2 text-2xl font-bold" data-testid="booked">
        <CheckCircle2 className="size-6 text-brand-accent-text" aria-hidden /> {t.bookedTitle}
      </p>
      {valid && (
        <p className="mt-2 text-lg font-semibold" data-testid="booked-time">
          {formatSlotLong(start, page.timeZone, BOOKING_LOCALE[lang])}
        </p>
      )}
      <BookingFacts page={page} lang={lang} />
      <p className="mt-4 text-muted-foreground">{t.bookedBody(page.hostName)}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {valid && (
          <Button asChild>
            <a
              href={`/b/${slug}/ics?${new URLSearchParams({ start, end, lang })}`}
              data-testid="add-to-calendar"
            >
              <CalendarPlus aria-hidden /> {t.addToCalendar}
            </a>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/b/${slug}?lang=${lang}`}>{t.bookAnother}</Link>
        </Button>
      </div>
    </BookingShell>
  );
}
