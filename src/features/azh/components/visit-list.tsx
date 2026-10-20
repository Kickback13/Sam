"use client";

import { AlertTriangle, Check, MapPin, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { officeLabel } from "../constants";
import { zonedParts } from "../schedule/time";
import { setVisitStatus } from "../server/actions/visits";
import type { VisitItem } from "../server/queries";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function VisitCard({
  visit,
  doubleBooked,
  showDate,
}: {
  visit: VisitItem;
  doubleBooked?: boolean;
  showDate?: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const canceled = visit.status === "canceled";

  function setStatus(status: "completed" | "canceled" | "scheduled") {
    start(async () => {
      const result = await setVisitStatus({ workspaceId: ws.id, visitId: visit.id, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        status === "completed"
          ? "Visit marked done"
          : status === "canceled"
            ? "Visit canceled"
            : "Visit restored",
      );
      router.refresh();
    });
  }

  const href = visit.dealId
    ? `/w/${ws.slug}/projects/${visit.dealId}?tab=schedule`
    : visit.requestId
      ? `/w/${ws.slug}/requests?request=${visit.requestId}`
      : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 text-xs",
        doubleBooked && !canceled && "border-amber-400 ring-1 ring-amber-300",
        canceled && "opacity-60",
      )}
      data-testid="visit-card"
    >
      <p className="font-semibold tabular">
        {showDate && `${dayFmt.format(new Date(visit.startsAt))} · `}
        {timeFmt.format(new Date(visit.startsAt))}–{timeFmt.format(new Date(visit.endsAt))}
      </p>
      <p className={cn("truncate text-sm font-semibold", canceled && "line-through")}>
        {href ? (
          <Link href={href} className="hover:underline">
            {visit.label}
          </Link>
        ) : (
          visit.label
        )}
      </p>
      <p className="flex items-center gap-1 text-muted-foreground">
        <User className="size-3" aria-hidden /> {visit.estimatorName ?? "No estimator"} ·{" "}
        {officeLabel(visit.office)}
      </p>
      {visit.address && (
        <p className="flex items-center gap-1 truncate text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden />{" "}
          <span className="truncate">{visit.address}</span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {visit.status !== "scheduled" && (
          <Badge variant={visit.status === "completed" ? "success" : "secondary"}>
            {visit.status}
          </Badge>
        )}
        {doubleBooked && !canceled && (
          <Badge variant="warning" data-testid="double-booked">
            <AlertTriangle className="size-3" aria-hidden /> Double-booked
          </Badge>
        )}
        {ws.canWrite && visit.status === "scheduled" && (
          <span className="ml-auto flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={pending}
              aria-label="Mark visit done"
              onClick={() => setStatus("completed")}
            >
              <Check aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={pending}
              aria-label="Cancel visit"
              onClick={() => setStatus("canceled")}
            >
              <X aria-hidden />
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Visits for one project or request, newest first. */
export function VisitList({ visits, emptyText }: { visits: VisitItem[]; emptyText: string }) {
  if (visits.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-2" data-testid="visit-list">
      {visits.map((v) => (
        <li key={v.id}>
          <VisitCard visit={v} showDate />
        </li>
      ))}
    </ul>
  );
}

export function visitDay(v: Pick<VisitItem, "startsAt">): string {
  return zonedParts(v.startsAt).date;
}
