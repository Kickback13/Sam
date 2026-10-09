import { ExternalLink } from "lucide-react";

import type { FieldSource } from "@/lib/field-sources";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "source · date" provenance chip shown next to every sourced value. */
export function SourceChip({
  source,
  className,
}: {
  source?: FieldSource | null;
  className?: string;
}) {
  if (!source) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border border-dashed px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
          className,
        )}
        title="No source recorded"
      >
        No source
      </span>
    );
  }
  const text = `${source.label} · ${formatDate(source.fetched_at)}`;
  const classes = cn(
    "inline-flex max-w-full items-center gap-1 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
    source.source === "demo" && "bg-violet-100 text-violet-900",
    className,
  );
  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className={cn(classes, "hover:underline")}
        title={text}
      >
        {text}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    );
  }
  return (
    <span className={classes} title={text} data-testid="source-chip">
      {text}
    </span>
  );
}
