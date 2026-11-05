import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { officeLabel, REQUEST_STATUSES } from "@/features/azh/constants";
import { LabeledBars, StatTile, WeeklyBars } from "@/features/reports/components";
import {
  parsePeriod,
  parseSummary,
  PERIODS,
  sumWeeks,
  winRate,
  type WeekRow,
} from "@/features/reports/summary";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { dealNoun } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Reports" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReportsPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/reports">) {
  const { slug } = await params;
  const days = parsePeriod(one((await searchParams).days));
  const { workspace } = await getWorkspaceContext(slug);
  const isAzh = workspace.businessType === "construction";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", {
    p_workspace_id: workspace.id,
    p_days: days,
  });
  if (error) throw error;
  const r = parseSummary(data);
  const series = (key: keyof Omit<WeekRow, "week">) =>
    r.weeks.map((w) => ({ week: w.week, value: w[key] }));
  const deals = dealNoun(workspace.businessType, true);
  const rate = winRate(r.closed.won, r.closed.lost);
  const openStages = r.stages.filter((s) => !s.is_won && !s.is_lost);
  const openCount = openStages.reduce((t, s) => t + s.open_count, 0);
  const openValue = openStages.reduce((t, s) => t + s.open_value, 0);
  const statusLabel = (v: string) => REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v;
  const offices = [...new Set(r.requests.map((q) => q.office))];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`How the business is doing, from what's in the app. Every number is counted live from your records; nothing is estimated.`}
        actions={
          <nav className="flex gap-1" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={`/w/${slug}/reports?days=${p.days}`}
                aria-current={days === p.days ? "page" : undefined}
                data-testid={`period-${p.days}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  days === p.days
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          testId="stat-open"
          label={`Open ${deals}`}
          value={formatNumber(openCount)}
          hint={
            openValue ? `${formatCurrency(openValue, { compact: true })} in pipeline` : undefined
          }
        />
        <StatTile
          testId="stat-won"
          label={`Won (${PERIODS.find((p) => p.days === days)?.label})`}
          value={formatNumber(r.closed.won)}
          hint={
            r.closed.won_value ? formatCurrency(r.closed.won_value, { compact: true }) : undefined
          }
        />
        <StatTile
          testId="stat-winrate"
          label="Win rate"
          value={rate === null ? "—" : `${rate}%`}
          hint={`${formatNumber(r.closed.won)} won · ${formatNumber(r.closed.lost)} lost`}
        />
        <StatTile
          testId="stat-contacts"
          label="New contacts"
          value={formatNumber(sumWeeks(r.weeks, "contacts"))}
        />
        {isAzh ? (
          <>
            <StatTile
              testId="stat-requests"
              label="Homeowner requests"
              value={formatNumber(sumWeeks(r.weeks, "requests"))}
            />
            <StatTile
              testId="stat-estimates"
              label="Estimates sent"
              value={formatNumber(r.estimates.sent)}
              hint={
                r.estimates.sent_value
                  ? formatCurrency(r.estimates.sent_value, { compact: true })
                  : undefined
              }
            />
            <StatTile
              testId="stat-accepted"
              label="Estimates accepted"
              value={formatNumber(r.estimates.accepted)}
              hint={
                r.estimates.accepted_value
                  ? formatCurrency(r.estimates.accepted_value, { compact: true })
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <StatTile
              testId="stat-listings"
              label="Listings received"
              value={formatNumber(r.listings.received)}
              hint={`${formatNumber(r.listings.promoted)} promoted · ${formatNumber(r.alerts)} alerts`}
            />
            <StatTile
              testId="stat-bookings"
              label="Calls booked"
              value={formatNumber(r.bookings.booked)}
              hint={`${formatNumber(r.bookings.completed)} held · ${formatNumber(r.bookings.no_show)} no-show`}
            />
            <StatTile
              testId="stat-texts"
              label="Texts"
              value={formatNumber(r.texts.sent + r.texts.received)}
              hint={`${formatNumber(r.texts.sent)} sent · ${formatNumber(r.texts.received)} received`}
            />
          </>
        )}
        <StatTile
          testId="stat-tasks"
          label="Tasks done"
          value={formatNumber(r.tasks.done)}
          hint={`${formatNumber(r.tasks.open)} open · ${formatNumber(r.tasks.overdue)} overdue`}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WeeklyBars testId="chart-contacts" title="New contacts" points={series("contacts")} />
        <WeeklyBars testId="chart-deals" title={`New ${deals}`} points={series("deals")} />
        <WeeklyBars testId="chart-calls" title="Calls logged" points={series("calls")} />
        {isAzh ? (
          <WeeklyBars
            testId="chart-requests"
            title="Homeowner requests"
            points={series("requests")}
          />
        ) : (
          <WeeklyBars
            testId="chart-listings"
            title="Listings received"
            points={series("listings")}
          />
        )}
        {!isAzh && (
          <WeeklyBars testId="chart-bookings" title="Calls booked" points={series("bookings")} />
        )}
        <WeeklyBars testId="chart-texts" title="Texts" points={series("texts")} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open {deals} by stage</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {openStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pipeline stages yet.</p>
            ) : (
              <LabeledBars
                testId="stage-bars"
                rows={openStages.map((s) => ({
                  label: s.name,
                  value: s.open_count,
                  color: s.color,
                  detail: s.open_value
                    ? formatCurrency(s.open_value, { compact: true })
                    : undefined,
                }))}
              />
            )}
          </CardContent>
        </Card>
        {isAzh ? (
          <Card>
            <CardHeader>
              <CardTitle>Requests by office</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1" data-testid="requests-by-office">
              {offices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests in this period.</p>
              ) : (
                offices.map((o) => (
                  <div key={o}>
                    <h3 className="mb-2 text-sm font-bold">{officeLabel(o)}</h3>
                    <LabeledBars
                      rows={r.requests
                        .filter((q) => q.office === o)
                        .map((q) => ({ label: statusLabel(q.status), value: q.n }))}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Why deals were lost</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {r.lostReasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lost deals in this period.</p>
              ) : (
                <LabeledBars
                  testId="lost-reasons"
                  rows={r.lostReasons.map((x) => ({ label: x.reason, value: x.n }))}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Counted {formatDateTime(r.generatedAt)}. Weeks start Monday (Pacific time).
      </p>
    </>
  );
}
