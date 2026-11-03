"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/format";

import { kickGhlAutoImport, runGhlAutoImportNow, saveGhlAutoImport } from "../server/auto-actions";
import type { GhlAutoImportState } from "../server/queries";
import { describeSummary, SYNC_INTERVALS, type SyncInterval, type SyncSummary } from "../sync";

function isSummary(v: unknown): v is SyncSummary {
  return Boolean(v && typeof v === "object" && "contacts" in v && "opportunities" in v);
}

/** Settings → Integrations → GoHighLevel: the automatic (scheduled) import card. */
export function GhlAutoImportCard({ state }: { state: GhlAutoImportState }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const [enabled, setEnabled] = useState(state.enabled);
  const [interval, setFrequency] = useState<SyncInterval>(
    (SYNC_INTERVALS.find((i) => i.minutes === state.intervalMinutes)?.minutes ??
      360) as SyncInterval,
  );

  function save(next: { enabled: boolean; intervalMinutes: SyncInterval }) {
    start(async () => {
      const r = await saveGhlAutoImport({ workspaceId: ws.id, ...next });
      if (!r.ok) {
        toast.error(r.error);
        setEnabled(state.enabled);
        return;
      }
      toast.success(next.enabled ? "Automatic import is on" : "Automatic import is off");
      router.refresh();
    });
  }

  const last = isSummary(state.lastSummary) ? describeSummary(state.lastSummary) : null;

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 text-sm"
      aria-labelledby="ghl-auto"
      data-testid="ghl-auto-import"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ghl-auto" className="font-sans text-base font-bold">
          Automatic import
        </h2>
        <Badge variant={state.enabled ? "success" : "secondary"} data-testid="ghl-auto-status">
          {state.enabled ? "On" : "Off"}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        While you still use GoHighLevel, new contacts and opportunities — and deals moved there —
        come over on their own. One way only: nothing is ever changed or sent in GoHighLevel. It
        runs in the background when an owner or admin has the app open and a run is due; only
        records GoHighLevel changed since the last run are touched, so edits made here stay.
      </p>
      {!state.hasStageMap && (
        <p className="rounded-md bg-muted px-3 py-2">
          Tip: run the opportunity import below once first — the automatic import uses the stage map
          you choose there. Until then, stages match by name.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="size-4"
            checked={enabled}
            disabled={pending}
            data-testid="ghl-auto-enabled"
            onChange={(e) => {
              setEnabled(e.target.checked);
              save({ enabled: e.target.checked, intervalMinutes: interval });
            }}
          />
          Import automatically
        </label>
        <div className="space-y-1">
          <Label htmlFor="ghl-auto-interval" className="text-xs">
            How often
          </Label>
          <NativeSelect
            id="ghl-auto-interval"
            value={interval}
            disabled={pending}
            onChange={(e) => {
              const v = Number(e.target.value) as SyncInterval;
              setFrequency(v);
              if (enabled) save({ enabled, intervalMinutes: v });
            }}
          >
            {SYNC_INTERVALS.map((i) => (
              <option key={i.minutes} value={i.minutes}>
                {i.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          variant="outline"
          disabled={running || state.running}
          data-testid="ghl-auto-run"
          onClick={() => {
            setRunning(true);
            void runGhlAutoImportNow({ workspaceId: ws.id })
              .then((r) => {
                if (!r.ok) toast.error(r.error);
                else toast.success(`Import finished: ${r.data.text}`);
                router.refresh();
              })
              .finally(() => setRunning(false));
          }}
        >
          {running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Import now
        </Button>
      </div>

      <div data-testid="ghl-auto-last" className="text-muted-foreground">
        {state.running || running ? (
          <p>Importing from GoHighLevel…</p>
        ) : state.lastFinishedAt ? (
          <p>
            Last run {formatDateTime(state.lastFinishedAt)}:{" "}
            {state.lastStatus === "error" ? (
              <span className="text-brand-danger">failed: {state.lastError}</span>
            ) : (
              <span className="text-foreground">{last ?? "done"}</span>
            )}
          </p>
        ) : (
          <p>Not run yet.</p>
        )}
      </div>
    </section>
  );
}

const KICK_KEY = "ghl-auto-kick:";
const KICK_EVERY_MS = 10 * 60_000;

/**
 * Rendered in the app shell for owners/admins. At most every 10 minutes per browser it asks
 * the server whether an automatic import is due; if so the server runs it in the background.
 */
export function GhlAutoImportKick({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    const key = KICK_KEY + workspaceId;
    try {
      const lastKick = Number(window.localStorage.getItem(key) ?? 0);
      if (Date.now() - lastKick < KICK_EVERY_MS) return;
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage blocked: still fine to ask (the server-side lock prevents double runs).
    }
    void kickGhlAutoImport({ workspaceId }).catch(() => undefined);
  }, [workspaceId]);
  return null;
}
