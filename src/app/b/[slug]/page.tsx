import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { groupSlotsByDay } from "@/features/h4a/booking/booking";
import { BookingPicker } from "@/features/h4a/components/booking/booking-picker";
import { BookingFacts, BookingShell } from "@/features/h4a/components/booking/public-booking";
import { getPublicBookingPage, getPublicSlots } from "@/features/h4a/server/booking-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicBookingPage(slug);
  return { title: page ? `${page.title} · ${page.workspaceName}` : "Book a call" };
}

export default async function BookingPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const page = await getPublicBookingPage(slug);
  if (!page) notFound();
  const slots = await getPublicSlots(slug);
  return (
    <BookingShell page={page}>
      <h1 className="text-2xl font-bold">{page.title}</h1>
      {page.hostName && <p className="mt-1 text-muted-foreground">With {page.hostName}</p>}
      {page.intro && <p className="mt-3 whitespace-pre-wrap">{page.intro}</p>}
      <BookingFacts page={page} />
      <div className="mt-6">
        <BookingPicker
          slug={slug}
          days={groupSlotsByDay(slots, page.timeZone)}
          timeZone={page.timeZone}
        />
      </div>
    </BookingShell>
  );
}
