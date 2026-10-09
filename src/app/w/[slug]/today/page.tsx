import { Building, CircleDot, ListChecks, Upload, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TIMEZONE } from "@/lib/constants";
import { endOfTodayIso, formatCurrency, formatNumber } from "@/lib/format";
import { dealNoun } from "@/lib/nav";
import { getRecentActivity } from "@/server/queries/activity";
import { getWorkspaceCounts } from "@/server/queries/members";
import { getPipelines, getStageTotals } from "@/server/queries/pipelines";
import { getTasks } from "@/server/queries/tasks";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Today" };

function Stat({ label, value, href, sub }: { label: string; value: string; href: string; sub?: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-card px-4 py-3 hover:border-foreground/30">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

export default async function TodayPage({ params }: PageProps<"/w/[slug]/today">) {
  const { slug } = await params;
  const { workspace, user, canWrite } = await getWorkspaceContext(slug);
  const base = `/w/${slug}`;
  const deals = dealNoun(workspace.businessType, true);

  const [counts, pipelines, dueTasks, unassigned, activity] = await Promise.all([
    getWorkspaceCounts(workspace.id),
    getPipelines(workspace.id),
    getTasks(workspace.id, { assignedTo: user.id, status: "open", dueBefore: endOfTodayIso(), limit: 50 }),
    getTasks(workspace.id, { assignedTo: "unassigned", status: "open", limit: 50 }),
    getRecentActivity(workspace.id, 15),
  ]);
  const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const totals = pipeline ? await getStageTotals(pipeline) : [];
  const openValue = totals.filter((s) => !s.isWon && !s.isLost).reduce((sum, s) => sum + s.totalValue, 0);
  const maxCount = Math.max(1, ...totals.map((s) => s.dealCount));
  const today = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const firstName = user.name.split(" ")[0];
  const isEmpty = counts.contacts === 0 && counts.open_deals === 0 && counts.properties === 0;

  return (
    <>
      <PageHeader
        title={`Today`}
        description={`${today} · Welcome back, ${firstName}`}
        actions={
          canWrite && (
            <>
              <NewTaskDialog />
              <Button asChild size="sm">
                <Link href={`${base}/people/new`}>
                  <UserPlus aria-hidden /> Contact
                </Link>
              </Button>
            </>
          )
        }
      />

      {isEmpty && canWrite && (
        <EmptyState
          className="mb-5"
          icon={Users}
          title={`${workspace.name} is ready`}
          description={
            workspace.businessType === "construction"
              ? "Start by bringing in your contacts (GoHighLevel exports import cleanly), then add your first project."
              : "Start by bringing in your contacts (GoHighLevel exports import cleanly), then add your first deal or property."
          }
          actions={
            <>
              <Button asChild>
                <Link href={`${base}/people/import`}>
                  <Upload aria-hidden /> Import your contacts
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${base}/pipeline?new=1`}>
                  <CircleDot aria-hidden /> Add your first {dealNoun(workspace.businessType)}
                </Link>
              </Button>
              {workspace.businessType === "real_estate" && (
                <Button asChild variant="outline">
                  <Link href={`${base}/properties/new`}>
                    <Building aria-hidden /> Add a property
                  </Link>
                </Button>
              )}
            </>
          }
        />
      )}

      <section aria-label="Key numbers" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Open ${deals}`} value={formatNumber(counts.open_deals)} href={`${base}/pipeline`} sub={`${formatCurrency(openValue, { compact: true })} in pipeline`} />
        <Stat label="My open tasks" value={formatNumber(counts.my_open_tasks)} href={`${base}/tasks`} sub={counts.my_overdue_tasks ? `${counts.my_overdue_tasks} overdue` : "None overdue"} />
        <Stat label="People" value={formatNumber(counts.contacts)} href={`${base}/people`} sub={`${formatNumber(counts.companies)} companies`} />
        <Stat label="Properties" value={formatNumber(counts.properties)} href={`${base}/properties`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4" aria-hidden /> My tasks — due & overdue
            </CardTitle>
            <Link href={`${base}/tasks`} className="text-sm font-semibold text-brand-accent-text hover:underline">
              All tasks
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            <TaskList tasks={dueTasks} emptyText="Nothing due today. Add a task to plan your follow-ups." />
            {unassigned.length > 0 && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {unassigned.length} open {unassigned.length === 1 ? "task is" : "tasks are"} unassigned —{" "}
                <Link href={`${base}/tasks?view=unassigned`} className="font-semibold text-brand-accent-text hover:underline">
                  review
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {pipeline?.name ?? "Pipeline"} by stage
            </CardTitle>
            <Link href={`${base}/pipeline`} className="text-sm font-semibold text-brand-accent-text hover:underline">
              Board
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            {totals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pipeline configured.</p>
            ) : (
              <ul className="space-y-2.5" data-testid="stage-totals">
                {totals.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="truncate font-medium">{s.name}</span>
                      </span>
                      <span className="shrink-0 tabular text-muted-foreground">
                        <strong className="text-foreground">{s.dealCount}</strong> · {formatCurrency(s.totalValue, { compact: true })}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-brand-primary" style={{ width: `${(s.dealCount / maxCount) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <ActivityTimeline
              items={activity}
              showSubject
              emptyText="No activity yet. Notes, calls and stage changes show up here."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
