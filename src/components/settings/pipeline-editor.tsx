"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createPipeline,
  deleteStage,
  renamePipeline,
  reorderStages,
  saveStage,
} from "@/server/actions/settings";

type StageRow = {
  id: string;
  name: string;
  color: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
};
type PipelineRow = {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  stages: StageRow[];
};

function StageEditor({
  pipelineId,
  stage,
  index,
  count,
  onMove,
}: {
  pipelineId: string;
  stage: StageRow;
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const ws = useWorkspace();
  const [v, setV] = useState({
    name: stage.name,
    color: stage.color,
    probability: String(stage.probability),
    outcome: stage.isWon ? "won" : stage.isLost ? "lost" : "open",
  });
  const [pending, start] = useTransition();
  const dirty =
    v.name !== stage.name ||
    v.color.toUpperCase() !== stage.color.toUpperCase() ||
    Number(v.probability) !== stage.probability ||
    v.outcome !== (stage.isWon ? "won" : stage.isLost ? "lost" : "open");

  return (
    <li
      className="grid grid-cols-[auto_1fr] gap-2 py-2.5 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:items-center"
      data-testid="stage-row"
    >
      <div className="flex flex-col">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Move ${stage.name} up`}
          disabled={index === 0 || pending || !ws.isAdmin}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Move ${stage.name} down`}
          disabled={index === count - 1 || pending || !ws.isAdmin}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${stage.name} color`}
          disabled={!ws.isAdmin}
          value={v.color}
          onChange={(e) => setV({ ...v, color: e.target.value })}
          className="h-9 w-10 shrink-0 rounded border border-input p-0.5"
        />
        <Input
          aria-label="Stage name"
          disabled={!ws.isAdmin}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </div>
      <div className="col-start-2 flex items-center gap-1 sm:col-start-auto">
        <Input
          aria-label={`${stage.name} probability`}
          disabled={!ws.isAdmin}
          inputMode="numeric"
          className="w-16"
          value={v.probability}
          onChange={(e) =>
            setV({ ...v, probability: e.target.value.replace(/\D/g, "").slice(0, 3) })
          }
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <NativeSelect
        aria-label={`${stage.name} outcome`}
        disabled={!ws.isAdmin}
        className="col-start-2 h-9 w-full text-sm sm:col-start-auto sm:w-28"
        value={v.outcome}
        onChange={(e) => setV({ ...v, outcome: e.target.value })}
      >
        <option value="open">Open</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </NativeSelect>
      <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto">
        <Badge variant="outline">{stage.dealCount} deals</Badge>
      </span>
      {ws.isAdmin && (
        <div className="col-start-2 flex gap-1 sm:col-start-auto">
          <Button
            size="sm"
            variant={dirty ? "default" : "ghost"}
            disabled={!dirty || pending}
            onClick={() =>
              start(async () => {
                const r = await saveStage({
                  workspaceId: ws.id,
                  pipelineId,
                  stageId: stage.id,
                  name: v.name,
                  color: v.color,
                  probability: Number(v.probability || 0),
                  is_won: v.outcome === "won",
                  is_lost: v.outcome === "lost",
                });
                if (r.ok) toast.success("Stage saved");
                else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            <span className="sr-only sm:not-sr-only">Save</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-brand-danger"
            aria-label={`Delete ${stage.name}`}
            disabled={pending}
            title={stage.dealCount > 0 ? "Move this stage's deals first" : undefined}
            onClick={() => {
              if (stage.dealCount > 0) {
                toast.error(
                  `${stage.name} still holds ${stage.dealCount} deal(s). Move them first.`,
                );
                return;
              }
              if (!confirm(`Delete the ${stage.name} stage?`)) return;
              start(async () => {
                const r = await deleteStage({ workspaceId: ws.id, stageId: stage.id });
                if (r.ok) toast.success("Stage deleted");
                else toast.error(r.error);
              });
            }}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}

function PipelineCard({ pipeline }: { pipeline: PipelineRow }) {
  const ws = useWorkspace();
  const [name, setName] = useState(pipeline.name);
  const [newStage, setNewStage] = useState("");
  const [order, setOrder] = useState(pipeline.stages.map((s) => s.id));
  const [pending, start] = useTransition();
  const stagesById = new Map(pipeline.stages.map((s) => [s.id, s]));
  const ordered = order.map((id) => stagesById.get(id)).filter((s): s is StageRow => Boolean(s));
  // Pick up stages added/removed by the server.
  if (ordered.length !== pipeline.stages.length) setOrder(pipeline.stages.map((s) => s.id));

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setOrder(next);
    start(async () => {
      const r = await reorderStages({
        workspaceId: ws.id,
        pipelineId: pipeline.id,
        stageIds: next,
      });
      if (!r.ok) {
        toast.error(r.error);
        setOrder(order);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-2">
        <Input
          aria-label="Pipeline name"
          className="max-w-xs font-semibold"
          disabled={!ws.isAdmin}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {ws.isAdmin && name !== pipeline.name && (
          <Button
            size="sm"
            onClick={() =>
              start(async () => {
                const r = await renamePipeline({
                  workspaceId: ws.id,
                  pipelineId: pipeline.id,
                  name,
                });
                if (r.ok) toast.success("Renamed");
                else toast.error(r.error);
              })
            }
          >
            Save name
          </Button>
        )}
        {pipeline.isDefault && <Badge variant="secondary">Default</Badge>}
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {ordered.map((s, i) => (
            <StageEditor
              key={s.id}
              pipelineId={pipeline.id}
              stage={s}
              index={i}
              count={ordered.length}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </ul>
        {ws.isAdmin && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newStage.trim()) return;
              start(async () => {
                const r = await saveStage({
                  workspaceId: ws.id,
                  pipelineId: pipeline.id,
                  name: newStage.trim(),
                  color: "#64748B",
                  probability: 0,
                  is_won: false,
                  is_lost: false,
                });
                if (r.ok) {
                  toast.success("Stage added");
                  setNewStage("");
                } else toast.error(r.error);
              });
            }}
          >
            <Input
              aria-label="New stage name"
              placeholder="New stage name"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={pending || !newStage.trim()}>
              <Plus aria-hidden /> Add stage
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function PipelineEditor({ pipelines }: { pipelines: PipelineRow[] }) {
  const ws = useWorkspace();
  const [name, setName] = useState("");
  const [kind, setKind] = useState(
    ws.businessType === "construction" ? "construction_project" : "acquisition",
  );
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      {pipelines.map((p) => (
        <PipelineCard key={p.id} pipeline={p} />
      ))}
      {ws.isAdmin && (
        <Card>
          <CardContent className="py-4">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await createPipeline({ workspaceId: ws.id, name, kind });
                  if (r.ok) {
                    toast.success("Pipeline created");
                    setName("");
                  } else toast.error(r.error);
                });
              }}
            >
              <Input
                aria-label="New pipeline name"
                className="max-w-xs"
                placeholder="New pipeline (e.g. Dispositions)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <NativeSelect
                aria-label="Pipeline kind"
                className="w-48"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="acquisition">Acquisition</option>
                <option value="disposition">Disposition</option>
                <option value="construction_project">Construction project</option>
              </NativeSelect>
              <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
                <Plus aria-hidden /> Add pipeline
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
