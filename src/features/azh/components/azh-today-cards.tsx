import { CalendarClock, FileClock, Hammer, Inbox, ListChecks } from "lucide-react";
import Link from "next/link";

import { formatDateTime, formatRelative } from "@/lib/format";

import { officeLabel } from "../constants";
import { formatMoney } from "../format";
import { getAzhToday } from "../server/today";

function Card({
  icon: Icon,
  label,
  count,
  href,
  sub,
  testId,
  children,
}: {
  icon: typeof Inbox;
  label: string;
  count: number;
  href: string;
  sub?: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col rounded-xl border bg-card px-4 py-3"
      data-testid={testId}
      aria-label={label}
    >
      <Link href={href} className="group">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" aria-hidden /> {label}
        </p>
        <p
          className="mt-1 font-display text-2xl font-bold tabular group-hover:underline"
          data-testid={`${testId}-count`}
        >
          {count}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </Link>
      {children && <ul className="mt-2 space-y-1 border-t pt-2 text-xs">{children}</ul>}
    </section>
  );
}

/** Construction Today: five real-data cards (hooked into the shared Today page). */
export async function AzhTodayCards({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = await getAzhToday(workspaceId);
  const base = `/w/${slug}`;
  return (
    <div
      className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      data-testid="azh-today"
    >
      <Card
        icon={Inbox}
        label="New requests · 7 days"
        count={t.newRequests.count}
        href={`${base}/requests`}
        testId="today-requests"
      >
        {t.newRequests.latest.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <Link href={`${base}/requests?request=${r.id}`} className="truncate hover:underline">
              {r.label}
            </Link>
            <span className="shrink-0 text-muted-foreground">{formatRelative(r.submittedAt)}</span>
          </li>
        ))}
      </Card>
      <Card
        icon={FileClock}
        label="Estimates awaiting reply"
        count={t.awaitingEstimates.count}
        href={`${base}/pipeline`}
        sub={
          t.awaitingEstimates.count
            ? `${formatMoney(t.awaitingEstimates.total)} out for signature`
            : "Nothing sent and waiting"
        }
        testId="today-estimates"
      >
        {t.awaitingEstimates.latest.map((e) => (
          <li key={e.id} className="truncate">
            <Link
              href={`${base}/projects/${e.dealId}?tab=estimates&estimate=${e.id}`}
              className="hover:underline"
            >
              {e.label}
            </Link>
          </li>
        ))}
      </Card>
      <Card
        icon={Hammer}
        label="Projects in progress"
        count={t.inProgress.count}
        href={`${base}/pipeline`}
        testId="today-progress"
      >
        {t.inProgress.latest.map((d) => (
          <li key={d.id} className="truncate">
            <Link href={`${base}/projects/${d.id}`} className="hover:underline">
              {d.title}
            </Link>
          </li>
        ))}
      </Card>
      <Card
        icon={CalendarClock}
        label="Estimate visits this week"
        count={t.visitsThisWeek.count}
        href={`${base}/schedule`}
        testId="today-visits"
      >
        {t.visitsThisWeek.next.map((v) => (
          <li key={v.id} className="truncate">
            {formatDateTime(v.startsAt)} · {officeLabel(v.office)} · {v.label}
          </li>
        ))}
      </Card>
      <Card
        icon={ListChecks}
        label="Tasks due"
        count={t.tasksDue}
        href={`${base}/tasks`}
        sub="Open tasks due today or overdue (whole team)"
        testId="today-tasks"
      />
    </div>
  );
}
