import { CalendarDays, Clock, Languages, MapPin } from "lucide-react";
import Link from "next/link";

import { brandStyleBlock } from "@/lib/brand";

import { BOOKING_TEXT, type BookingLang } from "../../booking/i18n";
import type { PublicBookingPage } from "../../server/booking-queries";

/** Branded frame for the public booking page (no app chrome, no sign-in). */
export function BookingShell({
  page,
  lang,
  switchHref,
  children,
}: {
  page: PublicBookingPage;
  lang: BookingLang;
  /** This page in the other language. */
  switchHref: string;
  children: React.ReactNode;
}) {
  const t = BOOKING_TEXT[lang];
  return (
    <div className="min-h-dvh bg-canvas" lang={lang} data-testid="booking-shell" data-lang={lang}>
      <style>{brandStyleBlock(page.brand)}</style>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-5 flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 min-w-12 items-center justify-center rounded-md bg-brand-accent px-2 font-display text-lg font-bold text-black"
          >
            {page.brand.logoText ?? "H4A"}
          </span>
          <span className="min-w-0 flex-1 truncate font-display text-xl font-bold">
            {page.workspaceName}
          </span>
          <Link
            href={switchHref}
            hrefLang={t.switchLang}
            lang={t.switchLang}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-sm font-semibold hover:bg-muted"
            data-testid="booking-switch-lang"
          >
            <Languages className="size-4" aria-hidden /> {t.switchTo}
          </Link>
        </header>
        <main className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">{children}</main>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t.footer}</p>
      </div>
    </div>
  );
}

export function BookingFacts({ page, lang }: { page: PublicBookingPage; lang: BookingLang }) {
  const t = BOOKING_TEXT[lang];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Clock className="size-4" aria-hidden /> {t.minutes(page.meetingMinutes)}
      </li>
      <li className="flex items-center gap-1.5">
        <MapPin className="size-4" aria-hidden /> {page.location}
      </li>
      <li className="flex items-center gap-1.5">
        <CalendarDays className="size-4" aria-hidden />{" "}
        {t.timesIn(page.timeZone.replace(/^.*\//, "").replace(/_/g, " "))}
      </li>
    </ul>
  );
}
