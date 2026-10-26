import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { scoreBand } from "../scoring/score";

const BAND = {
  high: { label: "High", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  medium: { label: "Medium", cls: "border-amber-300 bg-amber-50 text-amber-900" },
  low: { label: "Low", cls: "border-red-300 bg-red-50 text-red-900" },
  unscored: {
    label: "Not scored",
    cls: "border-dashed border-border bg-transparent text-muted-foreground",
  },
} as const;

/** Score 0–100 with its band in words (color is never the only signal). */
export function ScoreBadge({
  score,
  size = "md",
  className,
}: {
  score: number | null | undefined;
  size?: "md" | "lg";
  className?: string;
}) {
  const band = scoreBand(score);
  const b = BAND[band];
  const hasScore = score !== null && score !== undefined;
  return (
    <span
      data-testid="score-badge"
      data-score={hasScore ? score : ""}
      aria-label={
        hasScore ? `Score ${score} out of 100, ${b.label.toLowerCase()}` : "Not scored yet"
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border font-semibold tabular",
        size === "lg" ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs",
        b.cls,
        className,
      )}
    >
      {hasScore ? (
        <>
          <span className={cn("font-display font-bold", size === "lg" ? "text-2xl" : "text-sm")}>
            {score}
          </span>
          <span aria-hidden>{b.label}</span>
        </>
      ) : (
        <span aria-hidden>Not scored</span>
      )}
    </span>
  );
}

const STATUS = {
  new: { label: "New", variant: "info", Icon: Sparkles },
  needs_review: { label: "Needs review", variant: "warning", Icon: AlertTriangle },
  dismissed: { label: "Dismissed", variant: "secondary", Icon: CircleSlash },
  promoted: { label: "Promoted", variant: "success", Icon: CheckCircle2 },
} as const;

export function ListingStatusBadge({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? {
    label: status,
    variant: "outline" as const,
    Icon: CircleDashed,
  };
  return (
    <Badge variant={s.variant} data-testid="listing-status">
      <s.Icon aria-hidden /> {s.label}
    </Badge>
  );
}

const VERIFICATION = {
  unverified: { label: "Unverified", variant: "outline", Icon: ShieldQuestion },
  verified: { label: "Verified", variant: "success", Icon: ShieldCheck },
  mismatch: { label: "Mismatch", variant: "danger", Icon: ShieldAlert },
} as const;

export function VerificationBadge({ status }: { status: string }) {
  const v = VERIFICATION[status as keyof typeof VERIFICATION] ?? VERIFICATION.unverified;
  return (
    <Badge variant={v.variant} data-testid="verification-status">
      <v.Icon aria-hidden /> {v.label}
    </Badge>
  );
}
