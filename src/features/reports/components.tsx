import { formatNumber } from "@/lib/format";

/** A headline number. */
export function StatTile({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const edgeLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/**
 * One series per week as columns (single hue, rounded tops, 2px gaps). Every bar has a
 * tooltip and an accessible label; a table view sits underneath.
 */
export function WeeklyBars({
  title,
  points,
  testId,
}: {
  title: string;
  points: { week: string; value: number }[];
  testId?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((t, p) => t + p.value, 0);
  return (
    <figure className="rounded-xl border bg-card p-4" data-testid={testId}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs text-muted-foreground tabular">{formatNumber(total)} total</span>
      </figcaption>
      <div
        className="relative mt-3 flex h-28 items-end gap-0.5 border-b border-border"
        role="img"
        aria-label={`${title}: ${points.map((p) => `week of ${weekLabel(p.week)} ${p.value}`).join(", ")}`}
      >
        {total === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Nothing in this period yet
          </p>
        )}
        {points.map((p) => (
          <div
            key={p.week}
            className="group relative flex h-full flex-1 items-end"
            title={`Week of ${weekLabel(p.week)}: ${formatNumber(p.value)}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-brand-primary transition-opacity group-hover:opacity-80"
              style={{ height: p.value ? `${Math.max(4, (p.value / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0] ? edgeLabel(points[0].week) : ""}</span>
        <span>{points.at(-1) ? edgeLabel(points.at(-1)!.week) : ""}</span>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-1 w-full tabular">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-medium">Week of</th>
              <th className="text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.week}>
                <td>{weekLabel(p.week)}</td>
                <td className="text-right">{formatNumber(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars for a short labeled list (e.g. open deals per stage). */
export function LabeledBars({
  rows,
  testId,
}: {
  rows: { label: string; value: number; detail?: string; color?: string }[];
  testId?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.label} className="text-sm" data-label={r.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {r.color && (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular">
              {formatNumber(r.value)}
              {r.detail && (
                <span className="ml-1 font-normal text-muted-foreground">· {r.detail}</span>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-primary"
              style={{ width: r.value ? `${Math.max(2, (r.value / max) * 100)}%` : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
