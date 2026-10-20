"use client";

import { Brush, Check, Copy, ExternalLink, Loader2, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, FormSection } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { LICENSE_PENDING } from "../constants";
import {
  cleanupUnusedUploads,
  saveAzhSettings,
  saveFallbrookZips,
} from "../server/actions/settings";

export function AzhSettingsForm({
  initial,
  fallbrookZips,
  formUrl,
  embedUrl,
}: {
  initial: {
    cslb_license: string;
    service_types: string[];
    intake_enabled: boolean;
    san_diego_assignee: string;
    fallbrook_assignee: string;
  };
  fallbrookZips: string[];
  formUrl: string;
  embedUrl: string;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const readOnly = !ws.isAdmin;
  const [v, setV] = useState(initial);
  const [newService, setNewService] = useState("");
  const [zipsText, setZipsText] = useState(fallbrookZips.join(", "));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, startSaving] = useTransition();
  const [savingZips, startSavingZips] = useTransition();
  const [copied, setCopied] = useState(false);
  const [cleaning, startCleaning] = useTransition();
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const snippet = `<iframe src="${embedUrl}" title="Request an estimate from AZH Builders" style="width:100%;max-width:640px;height:1500px;border:0" loading="lazy"></iframe>`;

  function addService() {
    const s = newService.trim();
    if (!s) return;
    if (!v.service_types.some((x) => x.toLowerCase() === s.toLowerCase()))
      setV((p) => ({ ...p, service_types: [...p.service_types, s] }));
    setNewService("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startSaving(async () => {
      const result = await saveAzhSettings({
        workspaceId: ws.id,
        settings: {
          ...v,
          san_diego_assignee: v.san_diego_assignee || null,
          fallbrook_assignee: v.fallbrook_assignee || null,
        },
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success("AZH settings saved");
      router.refresh();
    });
  }

  function saveZips() {
    startSavingZips(async () => {
      const result = await saveFallbrookZips({ workspaceId: ws.id, zipsText });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.count} ZIPs now route to Fallbrook`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={save}
        className="rounded-xl border bg-card px-4 sm:px-6"
        data-testid="azh-settings-form"
      >
        <fieldset disabled={readOnly} className="contents">
          <FormSection
            title="License"
            description="Printed on every estimate PDF. Leave blank until you have it — PDFs then say “License # pending”."
          >
            <Field id="cslb" label="CSLB license number" error={errors.cslb_license?.[0]}>
              <Input
                id="cslb"
                value={v.cslb_license}
                onChange={(e) => setV((p) => ({ ...p, cslb_license: e.target.value }))}
                placeholder={LICENSE_PENDING}
                inputMode="numeric"
              />
            </Field>
          </FormSection>

          <FormSection
            title="Service types"
            description="Shown on projects, the request form and filters."
          >
            <div className="space-y-2 sm:col-span-2">
              <ul
                className="flex flex-wrap gap-2"
                aria-label="Service types"
                data-testid="service-types"
              >
                {v.service_types.map((s) => (
                  <li
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3 text-sm"
                  >
                    {s}
                    {!readOnly && (
                      <button
                        type="button"
                        className="rounded-full p-1 hover:bg-muted"
                        aria-label={`Remove ${s}`}
                        onClick={() =>
                          setV((p) => ({
                            ...p,
                            service_types: p.service_types.filter((x) => x !== s),
                          }))
                        }
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <div className="flex gap-2">
                  <Input
                    aria-label="New service type"
                    value={newService}
                    maxLength={60}
                    onChange={(e) => setNewService(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addService();
                      }
                    }}
                    placeholder="Add a service (e.g. Roofing)"
                  />
                  <Button type="button" variant="outline" onClick={addService}>
                    <Plus aria-hidden /> Add
                  </Button>
                </div>
              )}
              {errors.service_types && (
                <p role="alert" className="text-xs font-medium text-brand-danger">
                  {errors.service_types[0]}
                </p>
              )}
            </div>
          </FormSection>

          <FormSection
            title="Request form"
            description="New requests create a task for the routed office, assigned to the person below (or unassigned)."
          >
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="intake-enabled"
                checked={v.intake_enabled}
                onCheckedChange={(on) => setV((p) => ({ ...p, intake_enabled: on === true }))}
              />
              <Label htmlFor="intake-enabled">Accept requests from the public form</Label>
            </div>
            {(
              [
                ["san_diego_assignee", "San Diego office tasks go to"],
                ["fallbrook_assignee", "Fallbrook office tasks go to"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} id={key} label={label}>
                <NativeSelect
                  id={key}
                  value={v[key]}
                  onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {ws.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ))}
          </FormSection>
        </fieldset>
        {!readOnly && (
          <div className="flex justify-end border-t py-4">
            <Button type="submit" disabled={!hydrated || saving} data-testid="save-azh-settings">
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{" "}
              Save settings
            </Button>
          </div>
        )}
      </form>

      <section className="rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="zip-heading">
        <h2 id="zip-heading" className="text-sm font-bold">
          ZIP → office routing
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          ZIPs listed here route requests to the <strong>Fallbrook</strong> office. Every other ZIP
          routes to <strong>San Diego</strong>. The starting list is North County (see
          docs/DECISIONS-AZH.md, AZH-004) — please confirm it.
        </p>
        <Label htmlFor="zips" className="mt-3 block">
          Fallbrook ZIPs ({fallbrookZips.length})
        </Label>
        <Textarea
          id="zips"
          className="mt-1.5 font-mono text-sm"
          rows={4}
          value={zipsText}
          disabled={readOnly}
          onChange={(e) => setZipsText(e.target.value)}
        />
        {!readOnly && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={saveZips}
              disabled={!hydrated || savingZips}
              data-testid="save-zips"
            >
              {savingZips ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{" "}
              Save ZIP list
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="embed-heading">
        <h2 id="embed-heading" className="text-sm font-bold">
          Public request form
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Homeowners can request an estimate without logging in (English/Spanish). Nothing is sent
          back to them automatically.
        </p>
        <p className="mt-3 text-sm">
          <a
            href={formUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand-accent-text hover:underline"
          >
            {formUrl} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </p>
        <Label htmlFor="embed-snippet" className="mt-4 block">
          Embed on your website (paste into an HTML block)
        </Label>
        <Textarea
          id="embed-snippet"
          readOnly
          rows={3}
          className="mt-1.5 font-mono text-xs"
          value={snippet}
          data-testid="embed-snippet"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                toast.error("Couldn't copy — select the text and copy it manually.");
              }
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}{" "}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </div>
      </section>
      {ws.isAdmin && (
        <section className="rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="cleanup-heading">
          <h2 id="cleanup-heading" className="text-sm font-bold">
            Clean up unused uploads
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Removes request-form photos older than 24 hours that were never attached to a submitted
            request (for example, someone added photos and then left the form). Photos on submitted
            requests are never touched.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!hydrated || cleaning}
              data-testid="cleanup-uploads"
              onClick={() =>
                startCleaning(async () => {
                  setCleanupResult(null);
                  const result = await cleanupUnusedUploads({ workspaceId: ws.id });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  const n = result.data.removed;
                  setCleanupResult(
                    n === 0
                      ? "Nothing to clean up."
                      : `Removed ${n} unused upload${n === 1 ? "" : "s"}.`,
                  );
                })
              }
            >
              {cleaning ? <Loader2 className="animate-spin" aria-hidden /> : <Brush aria-hidden />}{" "}
              Clean up unused uploads
            </Button>
            {cleanupResult && (
              <p role="status" className="text-sm font-semibold" data-testid="cleanup-result">
                {cleanupResult}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
