"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building, User } from "lucide-react";

import { formatCurrency, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardDeal } from "@/server/queries/deals";

export function DealCardBody({ deal, dragging }: { deal: BoardDeal; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        dragging && "rotate-1 shadow-lg ring-2 ring-brand-accent",
      )}
    >
      <p className="line-clamp-2 text-sm font-semibold">{deal.title}</p>
      <p className="mt-1 text-sm font-bold tabular">{formatCurrency(deal.value)}</p>
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {deal.propertyLabel && (
          <p className="flex items-center gap-1 truncate">
            <Building className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{deal.propertyLabel}</span>
          </p>
        )}
        {deal.contactName && (
          <p className="flex items-center gap-1 truncate">
            <User className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{deal.contactName}</span>
          </p>
        )}
        <p>In stage {formatRelative(deal.stageEnteredAt).replace(" ago", "")}</p>
      </div>
    </div>
  );
}

export function SortableDealCard({
  deal,
  onOpen,
  disabled,
}: {
  deal: BoardDeal;
  onOpen: (id: string) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { type: "deal", stageId: deal.stageId },
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-40")}
      data-testid="deal-card"
      data-deal-id={deal.id}
      data-deal-title={deal.title}
    >
      <button
        type="button"
        className="block w-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => onOpen(deal.id)}
        {...attributes}
        {...listeners}
        aria-roledescription="Draggable deal"
        aria-label={`${deal.title}, ${formatCurrency(deal.value)}. Press space to pick up and move between stages, or enter to open.`}
      >
        <DealCardBody deal={deal} />
      </button>
    </li>
  );
}
