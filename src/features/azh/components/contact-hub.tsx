"use client";

import { CalendarCheck, ClipboardList, FileText, Hammer, MessageSquareOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ActivityEntry } from "@/components/activity/activity-timeline";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/queries/activity";

import {
  HUB_FILTERS,
  matchesFilter,
  type HubEntry,
  type HubEvent,
  type HubFilter,
} from "../hub/timeline";

const ICONS = {
  request: ClipboardList,
  visit: CalendarCheck,
  estimate: FileText,
  project: Hammer,
} as const;

function EventRow({ e }: { e: HubEvent }) {
  const ws = useWorkspace();
  const Icon = ICONS[e.kind];
  return (
    <li className="flex gap-3" data-hub-kind={e.kind}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Link href={`/w/${ws.slug}/${e.path}`} className="font-semibold hover:underline">
            {e.title}
          </Link>
          <span
            className="text-xs text-muted-foreground"
            title={e.dateOnly ? formatDate(e.at) : formatDateTime(e.at)}
          >
            {e.dateOnly ? formatDate(e.at) : formatRelative(e.at)}
          </span>
        </div>
        {e.detail && <p className="mt-0.5 text-sm break-words text-muted-foreground">{e.detail}</p>}
      </div>
    </li>
  );
}

/** AZH contact page: one timeline for everything that happened with this person (AZH-017). */
export function ContactHub({
  entries,
  textingOff,
}: {
  entries: HubEntry<ActivityItem>[];
  /** Why texting can't be used yet (null when it's on). */
  textingOff: string | null;
}) {
  const [filter, setFilter] = useState<HubFilter>("all");
  const shown = entries.filter((e) => matchesFilter(e, filter));
  const count = (f: HubFilter) => entries.filter((e) => matchesFilter(e, f)).length;

  return (
    <Card data-testid="contact-hub">
      <CardHeader>
        <CardTitle>Communication hub</CardTitle>
        <p className="text-xs text-muted-foreground">
          Calls, notes, requests, visits, estimates and projects for this contact, newest first.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {HUB_FILTERS.map((f) => {
            const n = count(f.value);
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                data-testid={`hub-filter-${f.value}`}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  filter === f.value
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label} <span className="tabular">{n}</span>
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {filter === "all"
              ? "Nothing yet. Log a call or add a note above."
              : "Nothing of this kind yet."}
          </p>
        ) : (
          <ol className="space-y-4" data-testid="hub-timeline">
            {shown.map((e) =>
              e.source === "activity" ? (
                <ActivityEntry
                  key={`a:${e.activity.id}`}
                  a={e.activity}
                  showSubject={e.activity.subject?.type === "deal"}
                />
              ) : (
                <EventRow key={e.event.id} e={e.event} />
              ),
            )}
          </ol>
        )}

        <p
          className="flex items-start gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
          data-testid="hub-messaging-status"
        >
          <MessageSquareOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {textingOff ? (
              <>
                <span className="font-semibold">Texts: {textingOff}</span> They will show here once
                texting is set up and switched on.
              </>
            ) : (
              <>Texts sent and received show here (filter: Texts).</>
            )}{" "}
            <span className="font-semibold">Emails: not connected.</span> Until then, log calls and
            notes above.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
