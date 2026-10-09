"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { positionAt } from "@/lib/positions";
import { cn } from "@/lib/utils";
import { moveDeal } from "@/server/actions/deals";
import type { BoardDeal } from "@/server/queries/deals";
import type { Pipeline, Stage } from "@/server/queries/pipelines";

import { DealCardBody, SortableDealCard } from "./deal-card";
import { DealDrawer } from "./deal-drawer";
import { NewDealDialog } from "./new-deal-dialog";

type Columns = Record<string, BoardDeal[]>;

function group(stages: Stage[], deals: BoardDeal[]): Columns {
  const cols: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as BoardDeal[]]));
  for (const d of [...deals].sort((a, b) => a.position - b.position))
    (cols[d.stageId] ??= []).push(d);
  return cols;
}

function findStage(cols: Columns, id: string): string | undefined {
  if (id in cols) return id;
  return Object.keys(cols).find((k) => cols[k].some((d) => d.id === id));
}

function Column({
  stage,
  deals,
  onOpen,
  disabled,
}: {
  stage: Stage;
  deals: BoardDeal[];
  onOpen: (id: string) => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: "stage" } });
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  return (
    <section
      aria-label={`${stage.name}: ${deals.length} deals`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/50",
        isOver && "ring-2 ring-brand-accent",
      )}
      data-testid="stage-column"
      data-stage-name={stage.name}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="flex min-w-0 items-center gap-2 font-sans text-sm font-bold">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="truncate">{stage.name}</span>
          <span className="rounded-full bg-background px-1.5 text-xs font-semibold text-muted-foreground tabular">
            {deals.length}
          </span>
        </h2>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular">
          {formatCurrency(total, { compact: true })}
        </span>
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {deals.map((d) => (
            <SortableDealCard key={d.id} deal={d} onOpen={onOpen} disabled={disabled} />
          ))}
          {deals.length === 0 && (
            <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Drop here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

export function PipelineView({
  pipeline,
  pipelines,
  deals,
}: {
  pipeline: Pipeline;
  pipelines: { id: string; name: string }[];
  deals: BoardDeal[];
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cols, setCols] = useState<Columns>(() => group(pipeline.stages, deals));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Columns | null>(null);
  const [pendingLost, setPendingLost] = useState<{
    dealId: string;
    stageId: string;
    position: number;
    revert: Columns;
  } | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [mobileStage, setMobileStage] = useState(
    () =>
      pipeline.stages.find((s) => deals.some((d) => d.stageId === s.id))?.id ??
      pipeline.stages[0]?.id ??
      "",
  );
  const [saving, startSaving] = useTransition();

  // Server data wins after every refresh (revalidation after a move/edit).
  const [synced, setSynced] = useState({ stages: pipeline.stages, deals });
  if (synced.deals !== deals || synced.stages !== pipeline.stages) {
    setSynced({ stages: pipeline.stages, deals });
    setCols(group(pipeline.stages, deals));
  }

  const openDealId = searchParams.get("deal");
  const showNew = searchParams.get("new") === "1";
  const stageById = useMemo(
    () => new Map(pipeline.stages.map((s) => [s.id, s])),
    [pipeline.stages],
  );
  const activeDeal = activeId
    ? Object.values(cols)
        .flat()
        .find((d) => d.id === activeId)
    : undefined;

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(
    dealId: string,
    stageId: string,
    position: number,
    revert: Columns,
    lost?: string,
  ) {
    startSaving(async () => {
      const result = await moveDeal({
        workspaceId: ws.id,
        dealId,
        stageId,
        position,
        lostReason: lost ?? null,
      });
      if (!result.ok) {
        setCols(revert);
        toast.error(result.error);
        return;
      }
      const stage = stageById.get(stageId);
      if (stage) toast.success(`Moved to ${stage.name}`);
    });
  }

  /** Apply a move locally (optimistic) and persist it. */
  function commitMove(
    dealId: string,
    toStage: string,
    toIndex: number,
    base: Columns,
    revert: Columns,
  ) {
    const deal = Object.values(base)
      .flat()
      .find((d) => d.id === dealId);
    if (!deal) return;
    const without = Object.fromEntries(
      Object.entries(base).map(([k, list]) => [k, list.filter((d) => d.id !== dealId)]),
    ) as Columns;
    const target = without[toStage] ?? [];
    const position = positionAt(target, toIndex);
    const moved = { ...deal, stageId: toStage, position };
    const next = {
      ...without,
      [toStage]: [...target.slice(0, toIndex), moved, ...target.slice(toIndex)],
    };
    const fromStage = findStage(revert, dealId);
    const fromIndex = fromStage ? revert[fromStage].findIndex((d) => d.id === dealId) : -1;
    if (fromStage === toStage && fromIndex === toIndex) {
      setCols(revert);
      return;
    }
    setCols(next);
    if (stageById.get(toStage)?.isLost && fromStage !== toStage) {
      setLostReason("");
      setPendingLost({ dealId, stageId: toStage, position, revert });
      return;
    }
    persist(dealId, toStage, position, revert);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDragOrigin(cols);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findStage(cols, String(active.id));
    const to = findStage(cols, String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const moving = prev[from].find((d) => d.id === active.id);
      if (!moving) return prev;
      const overIndex = prev[to].findIndex((d) => d.id === over.id);
      const index = overIndex >= 0 ? overIndex : prev[to].length;
      return {
        ...prev,
        [from]: prev[from].filter((d) => d.id !== active.id),
        [to]: [...prev[to].slice(0, index), { ...moving, stageId: to }, ...prev[to].slice(index)],
      };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const origin = dragOrigin ?? cols;
    setActiveId(null);
    setDragOrigin(null);
    const { active, over } = e;
    if (!over) {
      setCols(origin);
      return;
    }
    const to = findStage(cols, String(over.id));
    if (!to) {
      setCols(origin);
      return;
    }
    const list = cols[to];
    const overIndex = list.findIndex((d) => d.id === over.id);
    const activeIndex = list.findIndex((d) => d.id === active.id);
    // When hovering a card in the same list, place the active card at that card's slot.
    let toIndex = overIndex >= 0 ? overIndex : list.length;
    if (activeIndex >= 0 && overIndex >= 0 && activeIndex < overIndex) toIndex = overIndex;
    const withoutActive = list.filter((d) => d.id !== active.id);
    toIndex = Math.min(toIndex, withoutActive.length);
    commitMove(String(active.id), to, toIndex, cols, origin);
  }

  const stageTotals = pipeline.stages.map((s) => ({ stage: s, deals: cols[s.id] ?? [] }));
  const mobile = stageTotals.find((s) => s.stage.id === mobileStage) ?? stageTotals[0];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && (
          <NativeSelect
            aria-label="Pipeline"
            className="w-56"
            value={pipeline.id}
            onChange={(e) => router.push(`${pathname}?pipeline=${e.target.value}`)}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {saving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
          </span>
        )}
      </div>

      {/* Desktop / tablet board */}
      <div className="hidden md:block">
        <DndContext
          id={`board-${pipeline.id}`}
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            if (dragOrigin) setCols(dragOrigin);
            setActiveId(null);
            setDragOrigin(null);
          }}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Picked up ${active.data.current ? "deal" : ""}.`,
              onDragOver: ({ over }) =>
                over
                  ? `Over ${stageById.get(String(over.id))?.name ?? "a deal"}.`
                  : "Not over a stage.",
              onDragEnd: ({ over }) => (over ? "Dropped." : "Move cancelled."),
              onDragCancel: () => "Move cancelled.",
            },
          }}
        >
          <div
            className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-4 sm:-mx-6 sm:px-6"
            data-testid="kanban"
          >
            {stageTotals.map(({ stage, deals: list }) => (
              <Column
                key={stage.id}
                stage={stage}
                deals={list}
                onOpen={(id) => setParam("deal", id)}
                disabled={!ws.canWrite}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal ? <DealCardBody deal={activeDeal} dragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Phones: stage tabs + list, with a "Move to" control instead of dragging */}
      <div className="md:hidden" data-testid="stage-list">
        <div
          role="tablist"
          aria-label="Stages"
          className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1"
        >
          {stageTotals.map(({ stage, deals: list }) => (
            <button
              key={stage.id}
              role="tab"
              aria-selected={mobile?.stage.id === stage.id}
              onClick={() => setMobileStage(stage.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
                mobile?.stage.id === stage.id
                  ? "border-brand-ink bg-brand-ink text-white"
                  : "bg-card",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              {stage.name}
              <span className="tabular opacity-80">{list.length}</span>
            </button>
          ))}
        </div>
        {mobile && (
          <div role="tabpanel" aria-label={mobile.stage.name}>
            <p className="mb-2 text-sm text-muted-foreground">
              {mobile.deals.length} ·{" "}
              {formatCurrency(mobile.deals.reduce((s, d) => s + (d.value ?? 0), 0))}
            </p>
            {mobile.deals.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing in {mobile.stage.name}.
              </p>
            ) : (
              <ul className="space-y-2">
                {mobile.deals.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => setParam("deal", d.id)}
                    >
                      <DealCardBody deal={d} />
                    </button>
                    {ws.canWrite && (
                      <NativeSelect
                        aria-label={`Move ${d.title} to stage`}
                        className="mt-1 h-9 text-sm"
                        value=""
                        onChange={(e) => {
                          const to = e.target.value;
                          if (!to) return;
                          commitMove(d.id, to, 0, cols, cols);
                        }}
                      >
                        <option value="">Move to…</option>
                        {pipeline.stages
                          .filter((s) => s.id !== d.stageId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={pendingLost !== null}
        onOpenChange={(open) => {
          if (!open && pendingLost) {
            setCols(pendingLost.revert);
            setPendingLost(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was it lost?</DialogTitle>
            <DialogDescription>
              The reason is saved on the deal and in its history.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!pendingLost || !lostReason.trim()) return;
              persist(
                pendingLost.dealId,
                pendingLost.stageId,
                pendingLost.position,
                pendingLost.revert,
                lostReason.trim(),
              );
              setPendingLost(null);
            }}
            className="space-y-3"
          >
            <Label htmlFor="lost-reason">Reason</Label>
            <Textarea
              id="lost-reason"
              autoFocus
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Seller took a higher offer, numbers didn't work…"
            />
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={!lostReason.trim()}>
                Mark lost
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DealDrawer
        dealId={openDealId}
        stages={pipeline.stages}
        onClose={() => setParam("deal", null)}
        onMove={(dealId, stageId, lost) => {
          const base = cols;
          const target = (base[stageId] ?? []).filter((d) => d.id !== dealId);
          const position = positionAt(target, 0);
          const moving = Object.values(base)
            .flat()
            .find((d) => d.id === dealId);
          if (moving) {
            const without = Object.fromEntries(
              Object.entries(base).map(([k, l]) => [k, l.filter((d) => d.id !== dealId)]),
            ) as Columns;
            setCols({ ...without, [stageId]: [{ ...moving, stageId, position }, ...target] });
          }
          persist(dealId, stageId, position, base, lost);
        }}
      />
      <NewDealDialog
        open={showNew}
        onOpenChange={(open) => setParam("new", open ? "1" : null)}
        pipeline={pipeline}
      />
    </>
  );
}
