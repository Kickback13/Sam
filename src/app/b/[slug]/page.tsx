import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { groupSlotsByDay } from "@/features/h4a/booking/booking";
import { BOOKING_LOCALE, BOOKING_TEXT, pickBookingLang } from "@/features/h4a/booking/i18n";
import { BookingPicker } from "@/features/h4a/components/booking/booking-picker";
import { BookingFacts, BookingShell } from "@/features/h4a/components/booking/public-booking";
import { getPublicBookingPage, getPublicSlots } from "@/features/h4a/server/booking-queries";

export const dynamic = "force-dynamic";

async function langFor(sp: Record<string, string | string[] | undefined>) {
  return pickBookingLang(sp.lang, (await headers()).get("accept-language"));
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lang = await langFor(await searchParams);
  const page = await getPublicBookingPage(slug);
  return { title: page ? `${page.title} · ${page.workspaceName}` : BOOKING_TEXT[lang].pageTitle };
}

export default async function BookingPage({ params, searchParams }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const lang = await langFor(await searchParams);
  const t = BOOKING_TEXT[lang];
  const page = await getPublicBookingPage(slug);
  if (!page) notFound();
  const slots = await getPublicSlots(slug);
  return (
    <BookingShell page={page} lang={lang} switchHref={`/b/${slug}?lang=${t.switchLang}`}>
      <h1 className="text-2xl font-bold">{page.title}</h1>
      {page.hostName && <p className="mt-1 text-muted-foreground">{t.with(page.hostName)}</p>}
      {page.intro && <p className="mt-3 whitespace-pre-wrap">{page.intro}</p>}
      <BookingFacts page={page} lang={lang} />
      <div className="mt-6">
        <BookingPicker
          slug={slug}
          days={groupSlotsByDay(slots, page.timeZone, BOOKING_LOCALE[lang])}
          timeZone={page.timeZone}
          lang={lang}
        />
      </div>
    </BookingShell>
  );
}
