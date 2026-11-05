import { CalendarDays, Clock, MapPin } from "lucide-react";

import { brandStyleBlock } from "@/lib/brand";

import type { PublicBookingPage } from "../../server/booking-queries";

/** Branded frame for the public booking page (no app chrome, no sign-in). */
export function BookingShell({
  page,
  children,
}: {
  page: PublicBookingPage;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <style>{brandStyleBlock(page.brand)}</style>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-5 flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 min-w-12 items-center justify-center rounded-md bg-brand-accent px-2 font-display text-lg font-bold text-black"
          >
            {page.brand.logoText ?? "H4A"}
          </span>
          <span className="truncate font-display text-xl font-bold">{page.workspaceName}</span>
        </header>
        <main className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">{children}</main>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          We only use your details to reach you about this call. Nothing is sent automatically.
        </p>
      </div>
    </div>
  );
}

export function BookingFacts({ page }: { page: PublicBookingPage }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Clock className="size-4" aria-hidden /> {page.meetingMinutes} minutes
      </li>
      <li className="flex items-center gap-1.5">
        <MapPin className="size-4" aria-hidden /> {page.location}
      </li>
      <li className="flex items-center gap-1.5">
        <CalendarDays className="size-4" aria-hidden /> Times in{" "}
        {page.timeZone.replace(/^.*\//, "").replace(/_/g, " ")} time
      </li>
    </ul>
  );
}
