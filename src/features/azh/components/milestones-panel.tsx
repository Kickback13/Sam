"use client";

import { Flag, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate, todayInAppTz } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MILESTONE_STATUSES } from "../constants";
import { addMilestone, deleteMilestone, updateMilestone } from "../server/actions/milestones";
import type { MilestoneRow, UpcomingMilestone } from "../server/queries";

function isLate(m: Pick<MilestoneRow, "planned_on" | "status">, today: string) {
  return m.status !== "done" && m.planned_on !== null && m.planned_on < today;
}

export function MilestonesPanel({
  dealId,
  milestones,
}: {
  dealId: string;
  milestones: MilestoneRow[];
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [planned, setPlanned] = useState("");
  const [pending, start] = useTransition();
  const today = todayInAppTz();
  const done = milestones.filter((m) => m.status === "done").length;

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    msg: string,
    after?: () => void,
  ) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong");
        return;
      }
      toast.success(msg);
      after?.();
      router.refresh();
    });
  }

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Milestones"
      data-testid="milestones"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Milestones</h2>
        {milestones.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {done} of {milestones.length} done
          </span>
        )}
      </div>
      {milestones.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No milestones yet. Add the big steps — demo, framing inspection, drywall, final
          walkthrough.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {milestones.map((m) => (
            <li
              key={m.id}
              className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_150px_150px_36px] sm:items-center"
              data-testid="milestone-row"
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate font-semibold",
                    m.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {m.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.status === "done"
                    ? `Done ${formatDate(m.done_on)}`
                    : m.planned_on
                      ? `Planned ${formatDate(m.planned_on)}`
                      : "No date"}
                  {isLate(m, today) && (
                    <Badge variant="danger" className="ml-2">
                      Late
                    </Badge>
                  )}
                </span>
              </span>
              <Input
                type="date"
                aria-label={`Planned date for ${m.name}`}
                defaultValue={m.planned_on ?? ""}
                disabled={!ws.canWrite || pending}
                onBlur={(e) => {
                  if ((m.planned_on ?? "") !== e.target.value)
                    run(
                      () =>
                        updateMilestone({
                          workspaceId: ws.id,
                          milestoneId: m.id,
                          milestone: { planned_on: e.target.value },
                        }),
                      "Date updated",
                    );
                }}
              />
              <NativeSelect
                aria-label={`Status of ${m.name}`}
                value={m.status}
                disabled={!ws.canWrite || pending}
                onChange={(e) =>
                  run(
                    () =>
                      updateMilestone({
                        workspaceId: ws.id,
                        milestoneId: m.id,
                        milestone: { status: e.target.value },
                      }),
                    "Milestone updated",
                  )
                }
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
              {ws.canWrite && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${m.name}`}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteMilestone({ workspaceId: ws.id, milestoneId: m.id }),
                      "Milestone deleted",
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ws.canWrite && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(
              () =>
                addMilestone({
                  workspaceId: ws.id,
                  dealId,
                  milestone: { name, planned_on: planned },
                }),
              "Milestone added",
              () => {
                setName("");
                setPlanned("");
              },
            );
          }}
        >
          <Input
            aria-label="New milestone name"
            placeholder="Milestone (e.g. Framing inspection)"
            className="min-w-48 flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
          <Input
            aria-label="New milestone planned date"
            type="date"
            className="w-40"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={pending || !name.trim()}
            data-testid="add-milestone"
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add
          </Button>
        </form>
      )}
    </section>
  );
}

/** Next open milestones across all projects. */
export function UpcomingMilestones({ items, slug }: { items: UpcomingMilestone[]; slug: string }) {
  const today = todayInAppTz();
  return (
    <section
      className="rounded-xl border bg-card p-4"
      aria-label="Upcoming milestones"
      data-testid="upcoming-milestones"
    >
      <h2 className="mb-2 flex items-center gap-1.5 text-base font-bold">
        <Flag className="size-4" aria-hidden /> Upcoming milestones
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open milestones with a planned date.</p>
      ) : (
        <ul className="divide-y text-sm">
          {items.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.name}</span>
                <Link
                  href={`/w/${slug}/projects/${m.deal_id}?tab=schedule`}
                  className="block truncate text-xs text-brand-accent-text hover:underline"
                >
                  {m.dealTitle}
                </Link>
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs tabular",
                  isLate(m, today) ? "font-semibold text-brand-danger" : "text-muted-foreground",
                )}
              >
                {isLate(m, today) ? "Late · " : ""}
                {formatDate(m.planned_on)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
