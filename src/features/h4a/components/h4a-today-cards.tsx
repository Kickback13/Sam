import { AlertTriangle, Radar, ShieldQuestion, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";

import { ensureFreshScores } from "../server/fresh-scores";
import { getDealFinderToday } from "../server/queries";

function Card({
  icon: Icon,
  label,
  count,
  href,
  sub,
  testId,
  children,
}: {
  icon: typeof Radar;
  label: string;
  count: number;
  href: string;
  sub?: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col rounded-xl border bg-card px-4 py-3"
      data-testid={testId}
      aria-label={label}
    >
      <Link href={href} className="group">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" aria-hidden /> {label}
        </p>
        <p
          className="mt-1 font-display text-2xl font-bold tabular group-hover:underline"
          data-testid={`${testId}-count`}
        >
          {count}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </Link>
      {children && <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs">{children}</ul>}
    </section>
  );
}

/** Real-estate Today: Deal Finder cards from real data (hooked into the shared Today page). */
export async function H4aTodayCards({
  workspaceId,
  slug,
  canWrite,
  isAdmin,
}: {
  workspaceId: string;
  slug: string;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  await ensureFreshScores(workspaceId, canWrite);
  const t = await getDealFinderToday(workspaceId);
  const base = `/w/${slug}`;
  return (
    <div className="mb-5 space-y-3" data-testid="h4a-today">
      {t.buyBoxEmpty && (
        <section
          aria-label="Set your buy box"
          data-testid="today-set-buy-box"
          className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-bold">Set your buy box</p>
            <p className="text-sm text-muted-foreground">
              ZIPs, units, price and price per unit. Deal Finder scores every listing against it and
              alerts you on strong matches.
            </p>
          </div>
          {isAdmin ? (
            <Button asChild variant="dark" size="sm">
              <Link href={`${base}/settings/buy-box`}>
                <SlidersHorizontal aria-hidden /> Set your buy box
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Ask an owner or admin to set it.</p>
          )}
        </section>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card
          icon={Radar}
          label="New matches · 7 days"
          count={t.newMatches.count}
          href={`${base}/deal-finder?band=high&status=all`}
          sub={t.buyBoxEmpty ? "Needs a buy box" : `Scored ${t.threshold}+ against your buy box`}
          testId="today-new-matches"
        >
          {t.newMatches.top.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <Link
                href={`${base}/deal-finder/${l.id}`}
                className="block min-h-6 truncate py-0.5 hover:underline"
              >
                {l.address}
              </Link>
              <span className="shrink-0 text-muted-foreground tabular">{l.score}</span>
            </li>
          ))}
        </Card>
        <Card
          icon={AlertTriangle}
          label="Needs review"
          count={t.needsReview.count}
          href={`${base}/deal-finder?status=needs_review`}
          sub="Parsed with low confidence — check against the email"
          testId="today-needs-review"
        >
          {t.needsReview.top.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <Link
                href={`${base}/deal-finder/${l.id}`}
                className="block min-h-6 truncate py-0.5 hover:underline"
              >
                {l.address}
              </Link>
              <span className="shrink-0 text-muted-foreground">{formatRelative(l.receivedAt)}</span>
            </li>
          ))}
        </Card>
        <Card
          icon={ShieldQuestion}
          label="Verification queue"
          count={t.verification.count}
          href={`${base}/deal-finder?verification=unverified&sort=score`}
          sub="Open listings not yet checked against public records"
          testId="today-verification"
        >
          {t.verification.top.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <Link
                href={`${base}/deal-finder/${l.id}`}
                className="block min-h-6 truncate py-0.5 hover:underline"
              >
                {l.address}
              </Link>
              <span className="shrink-0 text-muted-foreground tabular">{l.score ?? "—"}</span>
            </li>
          ))}
        </Card>
      </div>
    </div>
  );
}
