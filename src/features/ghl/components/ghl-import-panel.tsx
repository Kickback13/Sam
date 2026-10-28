"use client";

import { Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

import type { GhlCursor, GhlPipeline } from "../client";
import { defaultStageMap, type LocalStage, type StageMap } from "../map";
import {
  finishGhlContactImport,
  importGhlContactsPage,
  importGhlOpportunitiesPage,
  startGhlContactImport,
} from "../server/actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a paged step until it reports no next cursor, waiting out GHL rate limits. */
async function runPages<T extends { next: GhlCursor }>(
  step: (
    cursor: GhlCursor,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: string; retryAfterSeconds?: number }>,
  onPage: (data: T) => void,
): Promise<string | null> {
  let cursor: GhlCursor = null;
  let retries = 0;
  for (let i = 0; i < 1000; i++) {
    const r = await step(cursor);
    if (!r.ok) {
      if (r.retryAfterSeconds && retries < 5) {
        retries += 1;
        await sleep(r.retryAfterSeconds * 1000);
        i -= 1;
        continue;
      }
      return r.error;
    }
    retries = 0;
    onPage(r.data);
    if (!r.data.next) return null;
    cursor = r.data.next;
  }
  return "Stopped after 1,000 pages.";
}

type ContactTotals = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  smsBlocked: number;
};

export function GhlContactImport() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [tags, setTags] = useState("ghl-import");
  const [total, setTotal] = useState<number | null>(null);
  const [totals, setTotals] = useState<ContactTotals | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-labelledby="ghl-c-h"
      data-testid="ghl-contacts"
    >
      <h2 id="ghl-c-h" className="font-sans text-base font-bold">
        1. Contacts
      </h2>
      <p className="text-sm text-muted-foreground">
        Same rules as a CSV import: a contact that matches an existing one (GHL ID, email or phone)
        is merged — blanks filled, tags added, DNC/opt-outs only ever tightened. Texting turned off
        in GHL goes on the do-not-send list. No SMS consent is assumed. Safe to run again.
      </p>
      <Field id="ghl-tags" label="Tag every imported contact with" help="Comma-separated, up to 5.">
        <Input
          id="ghl-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={pending}
        />
      </Field>
      {totals && (
        <div className="space-y-1 text-sm" data-testid="ghl-contacts-progress" aria-live="polite">
          <progress
            className="h-2 w-full accent-black"
            max={total ?? totals.fetched}
            value={totals.fetched}
            aria-label="Contacts imported"
          />
          <p>
            <span data-testid="ghl-contacts-fetched">{formatNumber(totals.fetched)}</span> of{" "}
            {formatNumber(total ?? totals.fetched)} read · {formatNumber(totals.created)} new ·{" "}
            {formatNumber(totals.updated)} merged · {formatNumber(totals.skipped)} skipped ·{" "}
            {formatNumber(totals.errors)} with errors · {formatNumber(totals.smsBlocked)} numbers
            added to do-not-text
          </p>
          {importId && !pending && (
            <Link
              href={`/w/${ws.slug}/people/import/${importId}`}
              className="font-semibold underline"
            >
              Open the import report
            </Link>
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <Button
        disabled={!hydrated || pending}
        data-testid="ghl-import-contacts"
        onClick={() =>
          start(async () => {
            setError(null);
            const started = await startGhlContactImport({
              workspaceId: ws.id,
              extraTags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            });
            if (!started.ok) {
              setError(started.error);
              return;
            }
            setImportId(started.data.importId);
            setTotal(started.data.total);
            const acc: ContactTotals = {
              fetched: 0,
              created: 0,
              updated: 0,
              skipped: 0,
              errors: 0,
              smsBlocked: 0,
            };
            setTotals({ ...acc });
            const err = await runPages(
              (cursor) =>
                importGhlContactsPage({
                  workspaceId: ws.id,
                  importId: started.data.importId,
                  cursor,
                  rowOffset: acc.fetched,
                }),
              (d) => {
                acc.fetched += d.fetched;
                acc.created += d.created;
                acc.updated += d.updated;
                acc.skipped += d.skipped;
                acc.errors += d.errors;
                acc.smsBlocked += d.smsBlocked;
                setTotals({ ...acc });
              },
            );
            await finishGhlContactImport({
              workspaceId: ws.id,
              importId: started.data.importId,
              failed: Boolean(err),
            });
            if (err)
              setError(
                `Stopped: ${err} What was imported so far is kept; run it again to continue.`,
              );
            else toast.success(`Contacts imported · ${acc.created} new, ${acc.updated} merged`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Import contacts from GoHighLevel
      </Button>
    </section>
  );
}

export function GhlOpportunityImport({
  ghlPipelines,
  localStages,
  defaultPipelineId,
  alreadyLinked,
}: {
  ghlPipelines: GhlPipeline[];
  localStages: LocalStage[];
  defaultPipelineId: string | null;
  alreadyLinked: number;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const pipelines = useMemo(
    () => [...new Map(localStages.map((s) => [s.pipelineId, s.pipelineName])).entries()],
    [localStages],
  );
  const [target, setTarget] = useState(defaultPipelineId ?? pipelines[0]?.[0] ?? "");
  const [map, setMap] = useState<StageMap>(() =>
    defaultStageMap(ghlPipelines, localStages, target),
  );
  const [result, setResult] = useState<{
    fetched: number;
    created: number;
    already: number;
    skipped: { name: string | null; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stagesFor = localStages.filter((s) => s.pipelineId === target);

  if (ghlPipelines.length === 0)
    return (
      <section
        className="rounded-xl border bg-card p-4 text-sm text-muted-foreground"
        data-testid="ghl-opps"
      >
        <h2 className="mb-1 font-sans text-base font-bold text-foreground">2. Opportunities</h2>
        GoHighLevel has no pipelines for this location, so there are no opportunities to bring over.
      </section>
    );

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-labelledby="ghl-o-h"
      data-testid="ghl-opps"
    >
      <h2 id="ghl-o-h" className="font-sans text-base font-bold">
        2. Opportunities → {pipelines.find((p) => p[0] === target)?.[1] ?? "pipeline"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Import contacts first so each deal links to its person. Pick where each GoHighLevel stage
        lands; won and lost opportunities go to the won / lost stage. Opportunities already imported
        are skipped
        {alreadyLinked ? ` (${formatNumber(alreadyLinked)} so far)` : ""}.
      </p>
      {pipelines.length > 1 && (
        <Field id="ghl-target" label="Import into pipeline">
          <NativeSelect
            id="ghl-target"
            value={target}
            disabled={pending}
            onChange={(e) => {
              setTarget(e.target.value);
              setMap(defaultStageMap(ghlPipelines, localStages, e.target.value));
            }}
          >
            {pipelines.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <div className="space-y-3" data-testid="ghl-stage-map">
        {ghlPipelines.map((p) => (
          <fieldset key={p.id} className="rounded-md border p-3">
            <legend className="px-1 text-sm font-bold">GoHighLevel: {p.name}</legend>
            <div className="grid gap-2">
              {p.stages.map((s) => (
                <div key={s.id} className="grid items-center gap-1 sm:grid-cols-[1fr_1fr] sm:gap-3">
                  <label htmlFor={`ghl-stage-${s.id}`} className="text-sm">
                    {s.name}
                  </label>
                  <NativeSelect
                    id={`ghl-stage-${s.id}`}
                    value={map[s.id] ?? ""}
                    disabled={pending}
                    onChange={(e) => setMap((m) => ({ ...m, [s.id]: e.target.value }))}
                  >
                    <option value="">Don&apos;t import</option>
                    {stagesFor.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {result && (
        <div className="space-y-1 text-sm" data-testid="ghl-opps-result" aria-live="polite">
          <p>
            {formatNumber(result.fetched)} read ·{" "}
            <span data-testid="ghl-opps-created">{formatNumber(result.created)}</span> deals created
            · {formatNumber(result.already)} already imported ·{" "}
            {formatNumber(result.skipped.length)} skipped
          </p>
          {result.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer">Skipped opportunities</summary>
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.slice(0, 100).map((s, i) => (
                  <li key={i}>
                    {s.name ?? "(no name)"} — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <Button
        disabled={!hydrated || pending || !target}
        data-testid="ghl-import-opps"
        onClick={() =>
          start(async () => {
            setError(null);
            const stageMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
            const acc = {
              fetched: 0,
              created: 0,
              already: 0,
              skipped: [] as { name: string | null; reason: string }[],
            };
            setResult({ ...acc });
            const err = await runPages(
              (cursor) => importGhlOpportunitiesPage({ workspaceId: ws.id, cursor, stageMap }),
              (d) => {
                acc.fetched += d.fetched;
                acc.created += d.created;
                acc.already += d.alreadyImported;
                acc.skipped.push(...d.skipped);
                setResult({ ...acc, skipped: [...acc.skipped] });
              },
            );
            if (err)
              setError(`Stopped: ${err} Deals created so far are kept; run it again to continue.`);
            else toast.success(`${acc.created} deals created from GoHighLevel`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Import opportunities
      </Button>
    </section>
  );
}
