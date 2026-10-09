"use client";

import { ArrowRight, Loader2, Pencil, Plus, Trash2, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LogActivity } from "@/components/activity/log-activity";
import { EntityPicker, type PickedEntity } from "@/components/common/entity-picker";
import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  addDealContact,
  deleteDeal,
  loadDeal,
  removeDealContact,
  saveDeal,
  type DealDetail,
} from "@/server/actions/deals";
import type { Stage } from "@/server/queries/pipelines";

export function DealDrawer({
  dealId,
  stages,
  onClose,
  onMove,
}: {
  dealId: string | null;
  stages: Stage[];
  onClose: () => void;
  onMove: (dealId: string, stageId: string, lostReason?: string) => void;
}) {
  return (
    <Sheet open={Boolean(dealId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-xl" data-testid="deal-drawer">
        {dealId && (
          <DealDrawerBody
            key={dealId}
            dealId={dealId}
            stages={stages}
            onClose={onClose}
            onMove={onMove}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DealDrawerBody({
  dealId,
  stages,
  onClose,
  onMove,
}: {
  dealId: string;
  stages: Stage[];
  onClose: () => void;
  onMove: (dealId: string, stageId: string, lostReason?: string) => void;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [newContact, setNewContact] = useState<PickedEntity | null>(null);
  const [newRole, setNewRole] = useState("");
  const [pending, start] = useTransition();

  const reload = useCallback(
    async (id: string) => {
      const result = await loadDeal({ workspaceId: ws.id, dealId: id });
      if (result.ok) {
        setDetail(result.data);
        setError(null);
      } else setError(result.error);
    },
    [ws.id],
  );

  useEffect(() => {
    let cancelled = false;
    loadDeal({ workspaceId: ws.id, dealId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId, ws.id]);

  const d = detail?.deal;
  const stage = d ? stages.find((s) => s.id === d.stageId) : undefined;
  const wonStage = stages.find((s) => s.isWon);
  const lostStage = stages.find((s) => s.isLost);

  function move(stageId: string, reason?: string) {
    if (!d) return;
    onMove(d.id, stageId, reason);
    setTimeout(() => void reload(d.id), 600);
  }

  return (
    <>
      {!d ? (
        <div className="space-y-3 p-5">
          <SheetTitle className="sr-only">Deal</SheetTitle>
          {error ? (
            <p className="text-sm text-brand-danger">{error}</p>
          ) : (
            <>
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-40 w-full" />
            </>
          )}
        </div>
      ) : (
        <>
          <SheetHeader>
            <SheetTitle>{d.title}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {stage && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </span>
              )}
              <Badge
                variant={
                  d.status === "won" ? "success" : d.status === "lost" ? "danger" : "secondary"
                }
              >
                {d.status}
              </Badge>
              <span className="font-bold text-foreground tabular">{formatCurrency(d.value)}</span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
            {ws.canWrite && (
              <section className="space-y-2" aria-label="Stage">
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label="Stage"
                    className="w-48"
                    value={d.stageId}
                    onChange={(e) => {
                      const to = stages.find((s) => s.id === e.target.value);
                      if (to?.isLost) {
                        setLosing(true);
                        return;
                      }
                      move(e.target.value);
                    }}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {wonStage && d.stageId !== wonStage.id && d.status !== "won" && (
                    <Button size="sm" variant="outline" onClick={() => move(wonStage.id)}>
                      <Trophy aria-hidden /> Won
                    </Button>
                  )}
                  {lostStage && d.status !== "lost" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-brand-danger"
                      onClick={() => setLosing(true)}
                    >
                      <X aria-hidden /> Lost
                    </Button>
                  )}
                </div>
                {losing && lostStage && (
                  <form
                    className="space-y-2 rounded-lg border p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!lostReason.trim()) return;
                      move(lostStage.id, lostReason.trim());
                      setLosing(false);
                      setLostReason("");
                    }}
                  >
                    <Field id="drawer-lost-reason" label="Why was it lost?">
                      <Textarea
                        id="drawer-lost-reason"
                        rows={2}
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        autoFocus
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setLosing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={!lostReason.trim()}
                      >
                        Mark lost
                      </Button>
                    </div>
                  </form>
                )}
                {d.status === "lost" && d.lostReason && (
                  <p className="text-sm text-muted-foreground">Lost reason: {d.lostReason}</p>
                )}
              </section>
            )}

            <section aria-label="Details">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-sans text-sm font-bold">Details</h3>
                {ws.canWrite && !editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                )}
              </div>
              {editing ? (
                <DealEditForm
                  detail={detail!}
                  onDone={async (saved) => {
                    setEditing(false);
                    if (saved) {
                      await reload(d.id);
                      router.refresh();
                    }
                  }}
                />
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Value</dt>
                  <dd className="tabular">{formatCurrency(d.value)}</dd>
                  {ws.businessType === "real_estate" && (
                    <>
                      <dt className="text-muted-foreground">Asking</dt>
                      <dd className="tabular">{formatCurrency(d.askingPrice)}</dd>
                      <dt className="text-muted-foreground">Units</dt>
                      <dd className="tabular">{formatNumber(d.units)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Expected close</dt>
                  <dd>{formatDate(d.expectedClose)}</dd>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd>{d.source ?? "—"}</dd>
                  <dt className="text-muted-foreground">Assigned to</dt>
                  <dd>{ws.members.find((m) => m.id === d.assignedTo)?.name ?? "Unassigned"}</dd>
                  <dt className="text-muted-foreground">
                    {ws.businessType === "construction" ? "Job site" : "Property"}
                  </dt>
                  <dd>
                    {d.property ? (
                      <Link
                        className="font-semibold text-brand-accent-text hover:underline"
                        href={`/w/${ws.slug}/properties/${d.property.id}`}
                      >
                        {d.property.label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Primary contact</dt>
                  <dd>
                    {d.primaryContact ? (
                      <Link
                        className="font-semibold text-brand-accent-text hover:underline"
                        href={`/w/${ws.slug}/people/${d.primaryContact.id}`}
                      >
                        {d.primaryContact.label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                  {d.notes && (
                    <>
                      <dt className="text-muted-foreground">Notes</dt>
                      <dd className="whitespace-pre-wrap">{d.notes}</dd>
                    </>
                  )}
                </dl>
              )}
            </section>

            <section aria-label="Contacts">
              <h3 className="mb-2 font-sans text-sm font-bold">Contacts on this deal</h3>
              {detail!.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional contacts.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail!.contacts.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/w/${ws.slug}/people/${c.id}`}
                          className="font-semibold hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.role && (
                          <span className="ml-2 text-xs text-muted-foreground">{c.role}</span>
                        )}
                      </span>
                      {ws.canWrite && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${c.name}`}
                          onClick={() =>
                            start(async () => {
                              const r = await removeDealContact({
                                workspaceId: ws.id,
                                dealId: d.id,
                                contactId: c.id,
                              });
                              if (!r.ok) toast.error(r.error);
                              else await reload(d.id);
                            })
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
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <EntityPicker
                    entityType="contact"
                    value={newContact}
                    onChange={setNewContact}
                    placeholder="Add a contact…"
                  />
                  <Input
                    aria-label="Role on deal"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="Role (e.g. Broker)"
                  />
                  <Button
                    size="default"
                    variant="outline"
                    disabled={!newContact || pending}
                    onClick={() =>
                      start(async () => {
                        const r = await addDealContact({
                          workspaceId: ws.id,
                          dealId: d.id,
                          contactId: newContact!.id,
                          role: newRole,
                        });
                        if (!r.ok) {
                          toast.error(r.error);
                          return;
                        }
                        setNewContact(null);
                        setNewRole("");
                        await reload(d.id);
                      })
                    }
                  >
                    <Plus aria-hidden /> Add
                  </Button>
                </div>
              )}
            </section>

            <section aria-label="Tasks">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-sans text-sm font-bold">Tasks</h3>
                <NewTaskDialog related={{ type: "deal", id: d.id, name: d.title }} />
              </div>
              <TaskList
                tasks={detail!.tasks}
                showRelated={false}
                showAssignee
                emptyText="No open tasks."
              />
            </section>

            <section aria-label="Stage history">
              <h3 className="mb-2 font-sans text-sm font-bold">Stage history</h3>
              <ol className="space-y-1.5 text-sm" data-testid="stage-history">
                {detail!.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground">{h.from ?? "Created"}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="font-semibold">{h.to}</span>
                    <span className="text-xs text-muted-foreground">
                      · {formatDateTime(h.at)}
                      {h.by ? ` · ${h.by}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-label="Activity" className="space-y-3">
              <h3 className="font-sans text-sm font-bold">Activity</h3>
              <LogActivity subjectType="deal" subjectId={d.id} />
              <ActivityTimeline items={detail!.activity} />
            </section>

            {ws.canWrite && (
              <Button
                variant="ghost"
                size="sm"
                className="text-brand-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete "${d.title}"?`)) return;
                  start(async () => {
                    const r = await deleteDeal({ workspaceId: ws.id, dealId: d.id });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success("Deleted");
                    onClose();
                  });
                }}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}{" "}
                Delete
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function DealEditForm({
  detail,
  onDone,
}: {
  detail: DealDetail;
  onDone: (saved: boolean) => void;
}) {
  const ws = useWorkspace();
  const d = detail.deal;
  const [v, setV] = useState({
    title: d.title,
    value: d.value?.toString() ?? "",
    asking_price: d.askingPrice?.toString() ?? "",
    units: d.units?.toString() ?? "",
    expected_close: d.expectedClose ?? "",
    source: d.source ?? "",
    assigned_to: d.assignedTo ?? "",
    notes: d.notes ?? "",
  });
  const [property, setProperty] = useState<PickedEntity | null>(d.property);
  const [contact, setContact] = useState<PickedEntity | null>(d.primaryContact);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveDeal({
            workspaceId: ws.id,
            dealId: d.id,
            deal: {
              ...v,
              assigned_to: v.assigned_to || null,
              pipeline_id: d.pipelineId,
              stage_id: d.stageId,
              property_id: property?.id ?? null,
              primary_contact_id: contact?.id ?? null,
            },
          });
          if (!r.ok) {
            setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error);
            return;
          }
          toast.success("Saved");
          onDone(true);
        });
      }}
    >
      <Field id="edit-title" label="Title" className="sm:col-span-2">
        <Input id="edit-title" value={v.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field id="edit-value" label="Value ($)">
        <Input
          id="edit-value"
          inputMode="decimal"
          value={v.value}
          onChange={(e) => set("value", e.target.value)}
        />
      </Field>
      {ws.businessType === "real_estate" && (
        <>
          <Field id="edit-asking" label="Asking ($)">
            <Input
              id="edit-asking"
              inputMode="decimal"
              value={v.asking_price}
              onChange={(e) => set("asking_price", e.target.value)}
            />
          </Field>
          <Field id="edit-units" label="Units">
            <Input
              id="edit-units"
              inputMode="numeric"
              value={v.units}
              onChange={(e) => set("units", e.target.value)}
            />
          </Field>
        </>
      )}
      <Field id="edit-close" label="Expected close">
        <Input
          id="edit-close"
          type="date"
          value={v.expected_close}
          onChange={(e) => set("expected_close", e.target.value)}
        />
      </Field>
      <Field id="edit-source" label="Source">
        <Input id="edit-source" value={v.source} onChange={(e) => set("source", e.target.value)} />
      </Field>
      <Field id="edit-assignee" label="Assigned to">
        <NativeSelect
          id="edit-assignee"
          value={v.assigned_to}
          onChange={(e) => set("assigned_to", e.target.value)}
        >
          <option value="">Unassigned</option>
          {ws.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="edit-property" label="Property">
        <EntityPicker
          id="edit-property"
          entityType="property"
          value={property}
          onChange={setProperty}
        />
      </Field>
      <Field id="edit-contact" label="Primary contact">
        <EntityPicker
          id="edit-contact"
          entityType="contact"
          value={contact}
          onChange={setContact}
        />
      </Field>
      <Field id="edit-notes" label="Notes" className="sm:col-span-2">
        <Textarea
          id="edit-notes"
          rows={3}
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-brand-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}Save
        </Button>
      </div>
    </form>
  );
}
