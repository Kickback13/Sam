import { CalendarDays, MapPin, User } from "lucide-react";
import Link from "next/link";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LogActivity } from "@/components/activity/log-activity";
import { PageHeader } from "@/components/common/page-header";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSubjectActivity } from "@/server/queries/activity";
import { getTasks } from "@/server/queries/tasks";
import type { WorkspaceContext } from "@/server/workspace";

import { adjustedContract, approvedChangeOrderTotal } from "../budget/math";
import { officeLabel } from "../constants";
import { formatMoney } from "../format";
import {
  getAzhSettings,
  getBudget,
  getEstimates,
  getEstimateWithItems,
  getProject,
  type ProjectDeal,
} from "../server/queries";
import { EstimatesPanel } from "./estimates-panel";
import { FilesSection } from "./files-section";
import { ProjectOverviewForm } from "./project-overview-form";
import { ComingInThisTrack, parseProjectTab, PROJECT_TABS, ProjectTabs } from "./project-tabs";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function ProjectPage({
  ctx,
  deal,
  searchParams,
}: {
  ctx: WorkspaceContext;
  deal: ProjectDeal;
  searchParams: SP;
}) {
  const ws = ctx.workspace;
  const slug = ws.slug;
  const base = `/w/${slug}/projects/${deal.id}`;
  const tab = parseProjectTab(one(searchParams.tab));
  const [project, budget] = await Promise.all([
    getProject(ws.id, deal.id),
    getBudget(ws.id, deal.id),
  ]);
  const approved = approvedChangeOrderTotal(budget.orders);
  const adjusted = adjustedContract(project?.contract_value ?? null, budget.orders);

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/pipeline`, label: "Projects" }}
        title={deal.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: deal.stageColor }}
              />
              {deal.stageName}
            </span>
            {project?.office && (
              <Badge variant="secondary">{officeLabel(project.office)} office</Badge>
            )}
            {project?.service_types.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
            <span className="font-bold text-foreground tabular" data-testid="project-value">
              {formatMoney(adjusted ?? project?.estimate_total ?? deal.value)}
            </span>
          </span>
        }
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/w/${slug}/pipeline?deal=${deal.id}`}>Open on board</Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {deal.contact && (
          <Link
            href={`/w/${slug}/people/${deal.contact.id}`}
            className="inline-flex items-center gap-1 font-semibold text-brand-accent-text hover:underline"
          >
            <User className="size-3.5" aria-hidden /> {deal.contact.name}
          </Link>
        )}
        {project?.job_address && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {project.job_address}
            {project.job_zip ? ` ${project.job_zip}` : ""}
          </span>
        )}
        {project?.start_on && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden /> Starts {project.start_on}
          </span>
        )}
      </div>

      <ProjectTabs base={base} active={tab} />

      {tab === "overview" && (
        <OverviewTab
          ctx={ctx}
          deal={deal}
          project={project}
          approved={approved}
          adjusted={adjusted}
        />
      )}
      {tab === "estimates" && (
        <EstimatesTab ctx={ctx} deal={deal} base={base} estimateId={one(searchParams.estimate)} />
      )}
      {tab === "tasks" && <TasksTab ctx={ctx} deal={deal} />}
      {tab === "activity" && <ActivityTab ctx={ctx} deal={deal} />}
      {tab === "files" && <FilesSection workspaceId={ws.id} parent={{ dealId: deal.id }} />}
      {(tab === "schedule" || tab === "budget") && (
        <ComingInThisTrack title={PROJECT_TABS.find((t) => t.key === tab)!.label} />
      )}
    </>
  );
}

async function OverviewTab({
  ctx,
  deal,
  project,
  approved,
  adjusted,
}: {
  ctx: WorkspaceContext;
  deal: ProjectDeal;
  project: Awaited<ReturnType<typeof getProject>>;
  approved: number;
  adjusted: number | null;
}) {
  const settings = await getAzhSettings(ctx.workspace.id);
  return (
    <ProjectOverviewForm
      dealId={deal.id}
      serviceOptions={settings?.service_types ?? []}
      estimateTotal={project?.estimate_total ?? null}
      adjustedContract={adjusted}
      approvedChanges={approved}
      initial={{
        job_address: project?.job_address ?? "",
        job_zip: project?.job_zip ?? "",
        property: deal.property && project?.property_id ? deal.property : null,
        service_types: project?.service_types ?? [],
        office: project?.office ?? "",
        source: project?.source ?? "",
        contract_value: project?.contract_value != null ? String(project.contract_value) : "",
        bid_sent_on: project?.bid_sent_on ?? "",
        start_on: project?.start_on ?? "",
        target_on: project?.target_on ?? "",
        completed_on: project?.completed_on ?? "",
        project_lead: project?.project_lead ?? "",
        notes: project?.notes ?? "",
      }}
    />
  );
}

async function EstimatesTab({
  ctx,
  deal,
  base,
  estimateId,
}: {
  ctx: WorkspaceContext;
  deal: ProjectDeal;
  base: string;
  estimateId: string | undefined;
}) {
  const estimates = await getEstimates(ctx.workspace.id, deal.id);
  const pick = estimates.find((e) => e.id === estimateId) ?? estimates[0];
  const selected = pick ? await getEstimateWithItems(ctx.workspace.id, pick.id) : null;
  return (
    <EstimatesPanel dealId={deal.id} basePath={base} estimates={estimates} selected={selected} />
  );
}

async function TasksTab({ ctx, deal }: { ctx: WorkspaceContext; deal: ProjectDeal }) {
  const tasks = await getTasks(ctx.workspace.id, {
    related: [{ type: "deal", id: deal.id }],
    status: "all",
  });
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Tasks">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Tasks</h2>
        {ctx.canWrite && (
          <NewTaskDialog related={{ type: "deal", id: deal.id, name: deal.title }} />
        )}
      </div>
      <TaskList tasks={tasks} showAssignee emptyText="No tasks for this project yet." />
    </section>
  );
}

async function ActivityTab({ ctx, deal }: { ctx: WorkspaceContext; deal: ProjectDeal }) {
  const subjects: { type: "deal" | "contact"; id: string }[] = [{ type: "deal", id: deal.id }];
  const activity = await getSubjectActivity(ctx.workspace.id, subjects);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label="Activity">
      {ctx.canWrite && <LogActivity subjectType="deal" subjectId={deal.id} />}
      <ActivityTimeline items={activity} emptyText="No activity yet." />
    </section>
  );
}
