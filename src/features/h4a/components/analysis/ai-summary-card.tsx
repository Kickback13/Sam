"use client";

import { Loader2, PlugZap, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

import type { CheckedSummary } from "../../ai/citations";
import { generateAiSummary } from "../../server/actions/analysis";

export function AiSummaryCard({
  connected,
  propertyId,
  scenarioId,
}: {
  connected: boolean;
  propertyId: string;
  scenarioId: string | null;
}) {
  const ws = useWorkspace();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<{ data: CheckedSummary; generatedAt: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      if (!scenarioId) return;
      setMessage(null);
      const r = await generateAiSummary({ workspaceId: ws.id, propertyId, scenarioId });
      if (!r.ok) return setMessage(r.error);
      if (r.data.status === "ok")
        setSummary({ data: r.data.summary, generatedAt: r.data.generatedAt });
      else setMessage(r.data.message);
    });

  return (
    <Card data-testid="ai-summary-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden /> AI summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-1 text-sm">
        {!connected ? (
          <>
            <p className="inline-flex items-center gap-1.5 rounded border border-dashed px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              <PlugZap className="size-3.5" aria-hidden /> Not connected
            </p>
            <p className="text-muted-foreground">
              Needs an Anthropic API key on Sam&apos;s account. When connected, the summary uses
              only the numbers on this page, every sentence cites the numbers it used, and any
              sentence with a figure we didn&apos;t give it is thrown out before you see it.
            </p>
          </>
        ) : !scenarioId ? (
          <p className="text-muted-foreground">Save a scenario to summarize it.</p>
        ) : (
          <>
            {summary && (
              <div className="space-y-2" data-testid="ai-summary">
                <ol className="space-y-2">
                  {summary.data.sentences.map((s, i) => (
                    <li key={i}>
                      <p>{s.text}</p>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Sources ({s.facts.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {s.facts.map((f) => (
                            <li key={f.id}>
                              {f.label}:{" "}
                              <span className="font-semibold text-foreground">{f.value}</span> —{" "}
                              {f.source}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-muted-foreground">
                  Generated {formatDateTime(summary.generatedAt)} by Claude.
                  {summary.data.dropped > 0 &&
                    ` ${summary.data.dropped} sentence${summary.data.dropped === 1 ? "" : "s"} failed the source check and ${summary.data.dropped === 1 ? "was" : "were"} removed.`}
                </p>
              </div>
            )}
            {message && (
              <p role="alert" className="text-sm font-medium text-brand-danger">
                {message}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={run} disabled={!hydrated || pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              {summary ? "Summarize again" : "Summarize this scenario"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
