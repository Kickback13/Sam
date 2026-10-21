"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shows a stored email. Plain text by default. "Formatted" renders the
 * already-sanitized HTML inside a sandboxed frame whose content policy blocks
 * scripts and every network request, so nothing in the email can load or run.
 */
export function EmailViewer({
  text,
  html,
  title,
}: {
  text: string | null;
  html: string | null;
  title: string;
}) {
  const [formatted, setFormatted] = useState(false);
  const doc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:12px;word-break:break-word}table{border-collapse:collapse}td,th{padding:2px 6px;vertical-align:top}</style></head><body>${html}</body></html>`
    : null;
  return (
    <div className="space-y-2">
      {doc && (
        <div className="flex gap-1" role="group" aria-label="Email view">
          <Button
            size="sm"
            variant={formatted ? "outline" : "dark"}
            onClick={() => setFormatted(false)}
            aria-pressed={!formatted}
          >
            Text
          </Button>
          <Button
            size="sm"
            variant={formatted ? "dark" : "outline"}
            onClick={() => setFormatted(true)}
            aria-pressed={formatted}
          >
            Formatted
          </Button>
        </div>
      )}
      {formatted && doc ? (
        <iframe
          title={title}
          sandbox=""
          srcDoc={doc}
          referrerPolicy="no-referrer"
          className="h-96 w-full rounded-lg border bg-white"
        />
      ) : (
        <pre
          className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed break-words whitespace-pre-wrap"
          data-testid="email-text"
        >
          {text ?? "(No text body)"}
        </pre>
      )}
    </div>
  );
}
