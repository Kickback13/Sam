import { CalendarDays, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { RsvpButtons } from "@/features/network/components/member-forms";
import { getNetworkContext, listEvents } from "@/features/network/server/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage({ params }: PageProps<"/n/[slug]/events">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const events = await listEvents(ctx.workspaceId, ctx.userId);
  return (
    <>
      <h1 className="font-display text-xl font-bold">Events</h1>
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming events"
          description="Meetups and webinars show up here."
        />
      ) : (
        <ul className="space-y-3" data-testid="events">
          {events.map((e) => (
            <li
              key={e.id}
              className="space-y-2 rounded-xl border bg-card p-4"
              data-testid="event"
              data-title={e.title}
            >
              <div>
                <p className="text-xs font-semibold text-brand-accent-text">
                  {formatDateTime(e.startsAt)}
                  {e.endsAt ? ` – ${formatDateTime(e.endsAt)}` : ""}
                </p>
                <h2 className="font-sans text-base font-bold">
                  {e.title}
                  {e.canceled && (
                    <span className="ml-2 text-sm font-semibold text-brand-danger">Canceled</span>
                  )}
                </h2>
              </div>
              {e.location && (
                <p className="flex items-start gap-1 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {e.location}
                </p>
              )}
              {e.description && <p className="text-sm whitespace-pre-wrap">{e.description}</p>}
              {e.url && (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold break-all underline"
                >
                  {e.url}
                </a>
              )}
              <p
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="going-count"
              >
                <Users className="size-3.5" aria-hidden /> {e.going} going
              </p>
              {!e.canceled && (
                <RsvpButtons workspaceId={ctx.workspaceId} eventId={e.id} mine={e.myRsvp} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
