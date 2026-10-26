import Link from "next/link";

import { SourceChip } from "@/components/common/source-chip";
import { parseFieldSources } from "@/lib/field-sources";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";

import type { ListingRow } from "../server/queries";
import { ListingStatusBadge, ScoreBadge, VerificationBadge } from "./badges";

/** One listing in the inbox. Stacks on phones, one row on wide screens. */
export function ListingCard({ listing, href }: { listing: ListingRow; href: string }) {
  const sources = parseFieldSources(listing.field_sources);
  const ppu = listing.price_per_unit === null ? null : Number(listing.price_per_unit);
  const place = [listing.city, listing.zip].filter(Boolean).join(", ");
  return (
    <li
      className="rounded-xl border bg-card px-4 py-3"
      data-testid="listing-card"
      data-address={listing.address}
    >
      <div className="flex items-start gap-3">
        <ScoreBadge
          score={listing.score}
          className="mt-0.5 hidden justify-center sm:inline-flex sm:min-w-[5.75rem]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={href} className="font-semibold break-words hover:underline">
                {listing.address}
              </Link>
              {place && <p className="text-sm text-muted-foreground">{place}</p>}
            </div>
            <ScoreBadge score={listing.score} className="sm:hidden" />
            <span className="hidden shrink-0 text-xs text-muted-foreground tabular sm:inline">
              Received {formatRelative(listing.received_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground sm:hidden">
            Received {formatRelative(listing.received_at)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Price</dt>
              <dd className="font-semibold tabular">{formatCurrency(listing.price)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Units</dt>
              <dd className="font-semibold tabular">{formatNumber(listing.units)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Price/unit</dt>
              <dd className="font-semibold tabular">{formatCurrency(ppu)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cap rate</dt>
              <dd className="font-semibold tabular">
                {listing.cap_rate === null ? "—" : `${Number(listing.cap_rate)}%`}
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ListingStatusBadge status={listing.status} />
            <VerificationBadge status={listing.verification_status} />
            <SourceChip source={sources.price ?? sources.address} />
          </div>
          {listing.status === "needs_review" && listing.review_reasons.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-900">{listing.review_reasons[0]}</p>
          )}
        </div>
      </div>
    </li>
  );
}
