"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityPicker, type PickedEntity } from "@/components/common/entity-picker";
import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { dealNoun } from "@/lib/nav";
import type { FieldErrors } from "@/lib/validation/common";
import { saveDeal } from "@/server/actions/deals";
import type { Pipeline } from "@/server/queries/pipelines";

export function NewDealDialog({
  open,
  onOpenChange,
  pipeline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const openStages = pipeline.stages.filter((s) => !s.isLost);
  const [v, setV] = useState({
    title: "",
    stage_id: openStages[0]?.id ?? "",
    value: "",
    asking_price: "",
    units: "",
    expected_close: "",
    source: "",
  });
  const [property, setProperty] = useState<PickedEntity | null>(null);
  const [contact, setContact] = useState<PickedEntity | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const noun = dealNoun(ws.businessType);
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));

  if (!ws.canWrite) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New {noun}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            start(async () => {
              const result = await saveDeal({
                workspaceId: ws.id,
                deal: {
                  ...v,
                  pipeline_id: pipeline.id,
                  property_id: property?.id ?? null,
                  primary_contact_id: contact?.id ?? null,
                },
              });
              if (!result.ok) {
                setErrors(result.fieldErrors ?? { title: [result.error] });
                return;
              }
              toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} created`);
              setV({
                title: "",
                stage_id: openStages[0]?.id ?? "",
                value: "",
                asking_price: "",
                units: "",
                expected_close: "",
                source: "",
              });
              setProperty(null);
              setContact(null);
              router.replace(`${pathname}?deal=${result.data.id}`, { scroll: false });
            });
          }}
        >
          <Field
            id="deal-title"
            label="Title"
            error={errors.title?.[0]}
            required
            className="sm:col-span-2"
          >
            <Input
              id="deal-title"
              autoFocus
              value={v.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={
                ws.businessType === "construction"
                  ? "Kitchen remodel — Smith"
                  : "24 units — Sample Ave"
              }
            />
          </Field>
          <Field id="deal-stage" label="Stage">
            <NativeSelect
              id="deal-stage"
              value={v.stage_id}
              onChange={(e) => set("stage_id", e.target.value)}
            >
              {openStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="deal-value"
            label={ws.businessType === "construction" ? "Contract value ($)" : "Deal value ($)"}
            error={errors.value?.[0]}
          >
            <Input
              id="deal-value"
              inputMode="decimal"
              value={v.value}
              onChange={(e) => set("value", e.target.value)}
            />
          </Field>
          {ws.businessType === "real_estate" && (
            <>
              <Field id="deal-asking" label="Asking price ($)" error={errors.asking_price?.[0]}>
                <Input
                  id="deal-asking"
                  inputMode="decimal"
                  value={v.asking_price}
                  onChange={(e) => set("asking_price", e.target.value)}
                />
              </Field>
              <Field id="deal-units" label="Units" error={errors.units?.[0]}>
                <Input
                  id="deal-units"
                  inputMode="numeric"
                  value={v.units}
                  onChange={(e) => set("units", e.target.value)}
                />
              </Field>
            </>
          )}
          <Field id="deal-close" label="Expected close">
            <Input
              id="deal-close"
              type="date"
              value={v.expected_close}
              onChange={(e) => set("expected_close", e.target.value)}
            />
          </Field>
          <Field id="deal-source" label="Source">
            <Input
              id="deal-source"
              value={v.source}
              onChange={(e) => set("source", e.target.value)}
              placeholder="Broker call, referral…"
            />
          </Field>
          <Field
            id="deal-property"
            label={ws.businessType === "construction" ? "Job site (property)" : "Property"}
          >
            <EntityPicker
              id="deal-property"
              entityType="property"
              value={property}
              onChange={setProperty}
              placeholder="Search properties…"
            />
          </Field>
          <Field id="deal-contact" label="Primary contact">
            <EntityPicker
              id="deal-contact"
              entityType="contact"
              value={contact}
              onChange={setContact}
              placeholder="Search people…"
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending} data-testid="create-deal">
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Create {noun}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
