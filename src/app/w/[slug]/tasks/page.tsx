import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Card, CardContent } from "@/components/ui/card";
import { endOfTodayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTasks } from "@/server/queries/tasks";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "My tasks" };

const VIEWS = [
  { key: "mine", label: "My open tasks" },
  { key: "due", label: "Due & overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "Everyone's open" },
  { key: "done", label: "Completed" },
] as const;

export default async function TasksPage({ params, searchParams }: PageProps<"/w/[slug]/tasks">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, user } = await getWorkspaceContext(slug);
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "mine";

  const tasks =
    view === "mine"
      ? await getTasks(workspace.id, { assignedTo: user.id })
      : view === "due"
        ? await getTasks(workspace.id, { assignedTo: user.id, dueBefore: endOfTodayIso() })
        : view === "unassigned"
          ? await getTasks(workspace.id, { assignedTo: "unassigned" })
          : view === "all"
            ? await getTasks(workspace.id, {})
            : await getTasks(workspace.id, { assignedTo: user.id, status: "done", limit: 100 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tasks"
        description="Follow-ups for you and your team."
        actions={<NewTaskDialog />}
      />
      <nav aria-label="Task views" className="mb-3 flex gap-1 overflow-x-auto">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "mine" ? `/w/${slug}/tasks` : `/w/${slug}/tasks?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold",
              view === v.key
                ? "border-brand-ink bg-brand-ink text-white"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent className="py-2">
          <TaskList
            tasks={tasks}
            showAssignee={view === "all" || view === "unassigned"}
            emptyText={view === "done" ? "No completed tasks yet." : "Nothing here — nice."}
          />
        </CardContent>
      </Card>
    </div>
  );
}
