"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityPicker, type PickedEntity } from "@/components/common/entity-picker";
import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { OFFICES } from "../constants";
import { saveProject } from "../server/actions/projects";
import type { ProjectFormValues } from "../validation";

export type ProjectFormInitial = {
  job_address: string;
  job_zip: string;
  property: PickedEntity | null;
  service_types: string[];
  office: string;
  source: string;
  contract_value: string;
  bid_sent_on: string;
  start_on: string;
  target_on: string;
  completed_on: string;
  project_lead: string;
  notes: string;
};

export function ProjectOverviewForm({
  dealId,
  initial,
  serviceOptions,
  estimateTotal,
  adjustedContract,
  approvedChanges,
}: {
  dealId: string;
  initial: ProjectFormInitial;
  serviceOptions: string[];
  estimateTotal: number | null;
  adjustedContract: number | null;
  approvedChanges: number;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, startSaving] = useTransition();
  const readOnly = !ws.canWrite;
  const services = [...new Set([...serviceOptions, ...v.service_types])];

  const set = <K extends keyof ProjectFormInitial>(key: K, value: ProjectFormInitial[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const err = (k: string) => errors[k]?.[0];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const project: ProjectFormValues = {
      job_address: v.job_address,
      job_zip: v.job_zip,
      property_id: v.property?.id ?? null,
      service_types: v.service_types,
      office: v.office || null,
      source: v.source,
      contract_value: v.contract_value,
      bid_sent_on: v.bid_sent_on,
      start_on: v.start_on,
      target_on: v.target_on,
      completed_on: v.completed_on,
      project_lead: v.project_lead || null,
      notes: v.notes,
    };
    startSaving(async () => {
      const result = await saveProject({ workspaceId: ws.id, dealId, project });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success("Project saved");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border bg-card px-4 sm:px-6"
      data-testid="project-form"
    >
      <fieldset disabled={readOnly} className="contents">
        <FormSection title="Job" description="Where the work is and what it covers.">
          <Field
            id="job_address"
            label="Job address"
            error={err("job_address")}
            className="sm:col-span-2"
          >
            <Input
              id="job_address"
              value={v.job_address}
              onChange={(e) => set("job_address", e.target.value)}
              autoComplete="street-address"
            />
          </Field>
          <Field id="job_zip" label="ZIP" error={err("job_zip")}>
            <Input
              id="job_zip"
              inputMode="numeric"
              maxLength={5}
              value={v.job_zip}
              onChange={(e) => set("job_zip", e.target.value)}
            />
          </Field>
          <Field
            id="property"
            label="Linked property"
            help="Optional — a property record in this workspace."
          >
            <EntityPicker
              id="property"
              entityType="property"
              value={v.property}
              onChange={(p) => set("property", p)}
              placeholder="Search properties…"
            />
          </Field>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Service types</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {services.map((s) => {
                const id = `svc-${s.replace(/\W+/g, "-").toLowerCase()}`;
                const checked = v.service_types.includes(s);
                return (
                  <div key={s} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(on) =>
                        set(
                          "service_types",
                          on ? [...v.service_types, s] : v.service_types.filter((x) => x !== s),
                        )
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {s}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <Field id="office" label="Office" error={err("office")}>
            <NativeSelect
              id="office"
              value={v.office}
              onChange={(e) => set("office", e.target.value)}
            >
              <option value="">Not set</option>
              {OFFICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="source"
            label="Source"
            error={err("source")}
            help="Referral, website, GC partner…"
          >
            <Input id="source" value={v.source} onChange={(e) => set("source", e.target.value)} />
          </Field>
        </FormSection>

        <FormSection title="Money" description="The estimate total comes from the Estimates tab.">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Estimate total</p>
            <p
              className="flex h-10 items-center text-sm font-bold tabular"
              data-testid="estimate-total"
            >
              {estimateTotal === null ? "No estimate yet" : formatCurrency(estimateTotal)}
            </p>
          </div>
          <Field
            id="contract_value"
            label="Contract value"
            error={err("contract_value")}
            help={
              approvedChanges !== 0
                ? `With approved change orders: ${formatCurrency(adjustedContract)}`
                : "Before change orders."
            }
          >
            <Input
              id="contract_value"
              inputMode="decimal"
              value={v.contract_value}
              onChange={(e) => set("contract_value", e.target.value)}
              placeholder="$0"
            />
          </Field>
        </FormSection>

        <FormSection title="Dates">
          {(
            [
              ["bid_sent_on", "Bid sent"],
              ["start_on", "Start"],
              ["target_on", "Target completion"],
              ["completed_on", "Completed"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} id={key} label={label} error={err(key)}>
              <Input
                id={key}
                type="date"
                value={v[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </FormSection>

        <FormSection title="Team & notes">
          <Field id="project_lead" label="Project lead" error={err("project_lead")}>
            <NativeSelect
              id="project_lead"
              value={v.project_lead}
              onChange={(e) => set("project_lead", e.target.value)}
            >
              <option value="">Unassigned</option>
              {ws.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="notes" label="Notes" error={err("notes")} className="sm:col-span-2">
            <Textarea
              id="notes"
              rows={4}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </FormSection>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end border-t py-4">
          <Button type="submit" disabled={!hydrated || saving} data-testid="save-project">
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
            project
          </Button>
        </div>
      )}
    </form>
  );
}
