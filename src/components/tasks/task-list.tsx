"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus } from "@/server/actions/tasks";
import type { TaskItem } from "@/server/queries/tasks";

export function TaskList({
  tasks,
  showRelated = true,
  showAssignee = false,
  emptyText = "Nothing here.",
}: {
  tasks: TaskItem[];
  showRelated?: boolean;
  showAssignee?: boolean;
  emptyText?: string;
}) {
  const ws = useWorkspace();
  const [optimistic, setOptimistic] = useOptimistic(
    tasks,
    (state, update: { id: string; status: TaskItem["status"] | "deleted" }) =>
      update.status === "deleted"
        ? state.filter((t) => t.id !== update.id)
        : state.map((t) =>
            t.id === update.id ? { ...t, status: update.status as TaskItem["status"] } : t,
          ),
  );
  const [, startTransition] = useTransition();
  const [now] = useState(() => Date.now());

  if (optimistic.length === 0)
    return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ul className="divide-y" data-testid="task-list">
      {optimistic.map((task) => {
        const done = task.status === "done";
        const overdue = !done && task.dueAt !== null && new Date(task.dueAt).getTime() < now;
        return (
          <li key={task.id} className="group flex items-start gap-3 py-2.5">
            <Checkbox
              className="mt-0.5"
              checked={done}
              disabled={!ws.canWrite}
              aria-label={done ? `Reopen "${task.title}"` : `Complete "${task.title}"`}
              onCheckedChange={(checked) => {
                const status = checked ? "done" : "open";
                startTransition(async () => {
                  setOptimistic({ id: task.id, status });
                  const result = await setTaskStatus({
                    workspaceId: ws.id,
                    taskId: task.id,
                    status,
                  });
                  if (!result.ok) toast.error(result.error);
                  else if (status === "done") toast.success("Task completed");
                });
              }}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}
              >
                {task.title}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {task.dueAt && (
                  <span
                    className={cn(overdue && "font-semibold text-brand-danger")}
                    title={formatDateTime(task.dueAt)}
                  >
                    {overdue ? "Overdue · " : "Due "}
                    {formatRelative(task.dueAt)}
                  </span>
                )}
                {showRelated && task.related && (
                  <Link
                    href={`/w/${ws.slug}/${task.related.path}`}
                    className="truncate font-medium text-brand-accent-text hover:underline"
                  >
                    {task.related.name}
                  </Link>
                )}
                {showAssignee && <span>{task.assigneeName ?? "Unassigned"}</span>}
              </div>
            </div>
            {ws.canWrite && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-60 group-hover:opacity-100"
                aria-label={`Delete "${task.title}"`}
                onClick={() =>
                  startTransition(async () => {
                    setOptimistic({ id: task.id, status: "deleted" });
                    const result = await deleteTask({ workspaceId: ws.id, taskId: task.id });
                    if (!result.ok) toast.error(result.error);
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
