"use client";

import {
  ArrowRightLeft,
  CalendarDays,
  Mail,
  MessageSquare,
  Phone,
  Settings2,
  StickyNote,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { ACTIVITY_LABELS } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CALL_OUTCOMES } from "@/lib/validation/activity";
import { deleteActivity } from "@/server/actions/activities";
import type { ActivityItem } from "@/server/queries/activity";

const ICONS = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  meeting: CalendarDays,
  stage_change: ArrowRightLeft,
  system: Settings2,
} as const;

export function ActivityTimeline({
  items,
  showSubject = false,
  emptyText = "No activity yet.",
}: {
  items: ActivityItem[];
  showSubject?: boolean;
  emptyText?: string;
}) {
  const ws = useWorkspace();
  const [pending, start] = useTransition();

  if (items.length === 0) return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ol className="relative space-y-4" data-testid="activity-timeline">
      {items.map((a) => {
        const Icon = ICONS[a.type];
        const outcome =
          typeof a.metadata.outcome === "string"
            ? CALL_OUTCOMES.find((o) => o.value === a.metadata.outcome)?.label
            : null;
        const duration =
          typeof a.metadata.duration_minutes === "number"
            ? `${a.metadata.duration_minutes} min`
            : null;
        const canDelete =
          ws.canWrite &&
          !["stage_change", "system"].includes(a.type) &&
          (a.createdBy === ws.userId || ws.isAdmin);
        return (
          <li key={a.id} className="group flex gap-3" data-activity-type={a.type}>
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{ACTIVITY_LABELS[a.type]}</span>
                {showSubject && a.subject && (
                  <Link
                    href={`/w/${ws.slug}/${a.subject.path}`}
                    className="truncate font-medium text-brand-accent-text hover:underline"
                  >
                    {a.subject.name}
                  </Link>
                )}
                <span
                  className="text-xs text-muted-foreground"
                  title={formatDateTime(a.occurredAt)}
                >
                  {a.actorName} · {formatRelative(a.occurredAt)}
                </span>
              </div>
              {(outcome || duration) && (
                <p className="text-xs text-muted-foreground">
                  {[outcome, duration].filter(Boolean).join(" · ")}
                </p>
              )}
              {a.body && <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{a.body}</p>}
            </div>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Delete activity"
                onClick={() =>
                  start(async () => {
                    const result = await deleteActivity({ workspaceId: ws.id, activityId: a.id });
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
    </ol>
  );
}
