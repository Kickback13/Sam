import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { todayInAppTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkspaceContext } from "@/server/workspace";

import { OFFICES } from "../constants";
import { doubleBookedIds } from "../schedule/conflicts";
import { addDays, weekStart, zonedDateTime, zonedParts } from "../schedule/time";
import { getUpcomingMilestones, getVisits } from "../server/queries";
import { UpcomingMilestones } from "./milestones-panel";
import { VisitCard } from "./visit-list";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const headFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const rangeFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export async function SchedulePage({
  ctx,
  searchParams,
}: {
  ctx: WorkspaceContext;
  searchParams: SP;
}) {
  const ws = ctx.workspace;
  const today = todayInAppTz();
  const rawWeek = one(searchParams.week);
  const monday = weekStart(rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) ? rawWeek : today);
  const officeParam = one(searchParams.office);
  const office: string =
    officeParam && OFFICES.some((o) => o.value === officeParam) ? officeParam : "all";
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [visits, milestones] = await Promise.all([
    getVisits(ws.id, {
      from: zonedDateTime(monday, "00:00").toISOString(),
      to: zonedDateTime(addDays(monday, 7), "00:00").toISOString(),
    }),
    getUpcomingMilestones(ws.id, 15),
  ]);
  // Double-booking is per estimator across both offices.
  const clashing = doubleBookedIds(visits);
  const shown = office === "all" ? visits : visits.filter((v) => v.office === office);
  const byDay = new Map(
    days.map((d) => [d, shown.filter((v) => zonedParts(v.startsAt).date === d)]),
  );
  const href = (patch: { week?: string; office?: string }) => {
    const p = new URLSearchParams();
    const w = patch.week ?? monday;
    if (w !== weekStart(today)) p.set("week", w);
    const o = patch.office ?? office;
    if (o !== "all") p.set("office", o);
    return `/w/${ws.slug}/schedule${p.size ? `?${p}` : ""}`;
  };
  const sunday = addDays(monday, 6);

  return (
    <>
      <PageHeader
        title="Schedule"
        description={`Estimate visits · ${rangeFmt.format(new Date(`${monday}T00:00:00Z`))} – ${rangeFmt.format(new Date(`${sunday}T00:00:00Z`))}`}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild size="icon-sm" variant="outline">
              <Link href={href({ week: addDays(monday, -7) })} aria-label="Previous week">
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={href({ week: weekStart(today) })}>This week</Link>
            </Button>
            <Button asChild size="icon-sm" variant="outline">
              <Link href={href({ week: addDays(monday, 7) })} aria-label="Next week">
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />
      <nav aria-label="Office" className="mb-4 flex gap-1.5 overflow-x-auto">
        {[{ value: "all", label: "Both offices" }, ...OFFICES].map((o) => (
          <Link
            key={o.value}
            href={href({ office: o.value })}
            aria-current={office === o.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold",
              office === o.value ? "border-brand-ink bg-brand-ink text-white" : "bg-card",
            )}
          >
            {o.label}
          </Link>
        ))}
      </nav>
      <p className="mb-3 text-sm text-muted-foreground">
        {shown.length} visit{shown.length === 1 ? "" : "s"} this week
        {clashing.size > 0 && ` · ${clashing.size} double-booked`}. Book visits from a request or a
        project.
      </p>
      <div className="grid gap-3 md:grid-cols-7" data-testid="week-grid">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <section
              key={d}
              aria-label={headFmt.format(new Date(`${d}T00:00:00Z`))}
              className={cn("rounded-xl border bg-muted/40 p-2", d === today && "border-brand-ink")}
              data-testid="week-day"
              data-date={d}
            >
              <h2 className="mb-2 flex items-center justify-between text-xs font-bold uppercase">
                <span>{headFmt.format(new Date(`${d}T00:00:00Z`))}</span>
                {d === today && (
                  <span className="rounded bg-brand-ink px-1.5 py-0.5 text-[10px] text-white">
                    Today
                  </span>
                )}
              </h2>
              {list.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground md:py-6">—</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((v) => (
                    <li key={v.id}>
                      <VisitCard visit={v} doubleBooked={clashing.has(v.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {visits.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden /> No visits booked this week. Open a request
          and choose “Schedule visit”.
        </p>
      )}
      <div className="mt-6 max-w-2xl">
        <UpcomingMilestones items={milestones} slug={ws.slug} />
      </div>
    </>
  );
}
