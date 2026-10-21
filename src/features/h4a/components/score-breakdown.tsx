import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { CriterionResult } from "../scoring/score";
import { ScoreBadge } from "./badges";

const ICON = {
  pass: { Icon: CheckCircle2, word: "Pass", cls: "text-emerald-700" },
  miss: { Icon: XCircle, word: "Miss", cls: "text-red-700" },
  unknown: { Icon: HelpCircle, word: "Unknown", cls: "text-muted-foreground" },
} as const;

function parseBreakdown(value: unknown): CriterionResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is CriterionResult =>
      Boolean(c) && typeof c === "object" && typeof (c as CriterionResult).message === "string",
  );
}

/** "Why this score": one line per buy-box criterion — pass, miss or unknown, with the actual value. */
export function ScoreBreakdown({
  score,
  breakdown,
  scoredAt,
  buyBoxHref,
  buyBoxEmpty,
}: {
  score: number | null;
  breakdown: unknown;
  scoredAt: string | null;
  buyBoxHref: string | null;
  buyBoxEmpty: boolean;
}) {
  const items = parseBreakdown(breakdown);
  return (
    <section aria-labelledby="why-score" data-testid="score-breakdown" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="why-score" className="text-base font-bold">
          Why this score
        </h2>
        <ScoreBadge score={score} size="lg" />
      </div>
      {buyBoxEmpty ? (
        <p className="text-sm text-muted-foreground">
          No score yet — the buy box is empty.{" "}
          {buyBoxHref && (
            <Link
              href={buyBoxHref}
              className="font-semibold text-brand-accent-text hover:underline"
            >
              Set your buy box
            </Link>
          )}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not scored yet.</p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {items.map((c) => {
              const s = ICON[c.status];
              return (
                <li
                  key={c.key}
                  className="flex gap-3 px-3 py-2.5"
                  data-criterion={c.key}
                  data-status={c.status}
                >
                  <s.Icon className={cn("mt-0.5 size-5 shrink-0", s.cls)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">
                        {c.label} — {s.word}
                      </span>
                      <span className="text-muted-foreground"> · {c.weight} pts</span>
                    </p>
                    <p className="text-sm">{c.message}</p>
                    <p className="text-xs text-muted-foreground">Your buy box: {c.target}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Score = points passed ÷ points your buy box sets. Unknown values earn nothing.
            {scoredAt ? ` Scored ${formatDate(scoredAt)}.` : ""}{" "}
            {buyBoxHref && (
              <Link
                href={buyBoxHref}
                className="font-semibold text-brand-accent-text hover:underline"
              >
                Edit buy box
              </Link>
            )}
          </p>
        </>
      )}
    </section>
  );
}
