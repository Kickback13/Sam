"use client";

import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { todayInAppTz } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { OFFICES, type Office } from "../constants";
import { scheduleVisit, type VisitConflict } from "../server/actions/visits";

export function ScheduleVisitDialog({
  requestId,
  dealId,
  defaultOffice,
  defaultAddress,
}: {
  requestId?: string | null;
  dealId?: string | null;
  defaultOffice: Office;
  defaultAddress?: string | null;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const blank = () => ({
    date: todayInAppTz(),
    time: "09:00",
    duration_min: "60",
    office: defaultOffice as string,
    estimator_id: ws.userId,
    address: defaultAddress ?? "",
    notes: "",
  });
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [conflicts, setConflicts] = useState<VisitConflict[] | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof ReturnType<typeof blank>, value: string) => {
    setV((p) => ({ ...p, [k]: value }));
    setConflicts(null);
  };

  function submit(confirmOverlap: boolean) {
    start(async () => {
      const result = await scheduleVisit({
        workspaceId: ws.id,
        confirmOverlap,
        visit: {
          ...v,
          estimator_id: v.estimator_id || null,
          request_id: requestId ?? null,
          deal_id: dealId ?? null,
        },
      });
      if (!result.ok) {
        if (result.conflicts) {
          setConflicts(result.conflicts);
          return;
        }
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Estimate visit scheduled");
      setOpen(false);
      setV(blank());
      setConflicts(null);
      setErrors({});
      router.refresh();
    });
  }

  if (!ws.canWrite) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="schedule-visit">
          <CalendarPlus aria-hidden /> Schedule visit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule an estimate visit</DialogTitle>
          <DialogDescription>
            Internal only — nothing is sent to the homeowner or added to an outside calendar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="visit-date" label="Date" error={errors.date?.[0]}>
              <Input
                id="visit-date"
                type="date"
                value={v.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </Field>
            <Field id="visit-time" label="Start time" error={errors.time?.[0]}>
              <Input
                id="visit-time"
                type="time"
                step={900}
                value={v.time}
                onChange={(e) => set("time", e.target.value)}
                required
              />
            </Field>
            <Field id="visit-duration" label="Length">
              <NativeSelect
                id="visit-duration"
                value={v.duration_min}
                onChange={(e) => set("duration_min", e.target.value)}
              >
                {[30, 45, 60, 90, 120, 180].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="visit-office" label="Office">
              <NativeSelect
                id="visit-office"
                value={v.office}
                onChange={(e) => set("office", e.target.value)}
              >
                {OFFICES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="visit-estimator" label="Estimator" className="col-span-2">
              <NativeSelect
                id="visit-estimator"
                value={v.estimator_id}
                onChange={(e) => set("estimator_id", e.target.value)}
              >
                <option value="">Not assigned</option>
                {ws.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="visit-address" label="Address" className="col-span-2">
              <Input
                id="visit-address"
                value={v.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
            <Field id="visit-notes" label="Notes" className="col-span-2">
              <Textarea
                id="visit-notes"
                rows={2}
                value={v.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          {conflicts && (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              data-testid="visit-conflict"
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" aria-hidden /> Double-booked
              </p>
              <p>This estimator already has:</p>
              <ul className="list-disc pl-5">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.when} — {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            {conflicts ? (
              <>
                <Button type="button" variant="outline" onClick={() => setConflicts(null)}>
                  Change time
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(true)}
                  data-testid="book-anyway"
                >
                  {pending && <Loader2 className="animate-spin" aria-hidden />} Book anyway
                </Button>
              </>
            ) : (
              <Button type="submit" disabled={!hydrated || pending} data-testid="save-visit">
                {pending && <Loader2 className="animate-spin" aria-hidden />} Schedule
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
