import { AlertTriangle, Building, CircleDot, ExternalLink, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { SourceChip } from "@/components/common/source-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingStatusBadge, VerificationBadge } from "@/features/h4a/components/badges";
import { EmailViewer } from "@/features/h4a/components/email-viewer";
import { ListingActions } from "@/features/h4a/components/listing-actions";
import { ListingHistory } from "@/features/h4a/components/listing-history";
import { ScoreBreakdown } from "@/features/h4a/components/score-breakdown";
import { VerifyButtons } from "@/features/h4a/components/verify-panel";
import { labelOf, LISTING_ORIGINS } from "@/features/h4a/constants";
import { countyRecordsAdapter } from "@/features/h4a/county/adapter";
import { formatApn } from "@/features/h4a/listing/normalize";
import { isBuyBoxEmpty } from "@/features/h4a/scoring/score";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { ensureFreshScores } from "@/features/h4a/server/fresh-scores";
import {
  getListing,
  getListingAlert,
  getListingEmails,
  getListingEvents,
  type InboundEmailRow,
} from "@/features/h4a/server/queries";
import { loadBuyBox } from "@/features/h4a/server/rescore";
import { labelFor, PROPERTY_TYPES } from "@/lib/constants";
import { parseFieldSources } from "@/lib/field-sources";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listing" };

function EmailCard({ email }: { email: InboundEmailRow }) {
  return (
    <Card data-testid="source-email">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" aria-hidden /> Source email
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {email.subject ?? "(no subject)"} · {email.from_address ?? "unknown sender"} ·{" "}
          {formatDateTime(email.received_at)}
          {email.parser_label ? ` · read by ${email.parser_label}` : ""}
          {email.confidence ? ` · ${email.confidence} confidence` : ""}
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <EmailViewer
          text={email.text_body}
          html={email.html_body}
          title={`Email: ${email.subject ?? ""}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Links in emails are never opened by the app. Only the email itself is stored.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function ListingPage({ params }: PageProps<"/w/[slug]/deal-finder/[id]">) {
  const { slug, id } = await params;
  const { workspace, canWrite, isAdmin } = await getRealEstateContext(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await ensureFreshScores(workspace.id, canWrite);
  const listing = await getListing(workspace.id, id);
  if (!listing) notFound();
  const [events, alert, buyBox] = await Promise.all([
    getListingEvents(workspace.id, id),
    getListingAlert(workspace.id, id),
    loadBuyBox(await createClient(), workspace.id),
  ]);
  const emails = await getListingEmails(
    workspace.id,
    events.map((e) => e.email_id).filter((v): v is string => Boolean(v)),
  );
  const sources = parseFieldSources(listing.field_sources);
  const ppu = listing.price_per_unit === null ? null : Number(listing.price_per_unit);
  const base = `/w/${slug}`;
  const county = countyRecordsAdapter();
  const latestEmail = emails[0] ?? null;
  const reviewing = listing.status === "needs_review";

  const facts: { key: string; label: string; value: string; calculated?: string }[] = [
    { key: "price", label: "Price", value: formatCurrency(listing.price) },
    { key: "units", label: "Units", value: formatNumber(listing.units) },
    {
      key: "price_per_unit",
      label: "Price per unit",
      value: formatCurrency(ppu),
      calculated: "Calculated: price ÷ units",
    },
    {
      key: "cap_rate",
      label: "Cap rate",
      value: listing.cap_rate === null ? "—" : `${Number(listing.cap_rate)}%`,
    },
    {
      key: "property_type",
      label: "Type",
      value: labelFor(PROPERTY_TYPES, listing.property_type) || "—",
    },
    {
      key: "year_built",
      label: "Year built",
      value: listing.year_built ? String(listing.year_built) : "—",
    },
    { key: "building_sqft", label: "Building sq ft", value: formatNumber(listing.building_sqft) },
    { key: "lot_sqft", label: "Lot sq ft", value: formatNumber(listing.lot_sqft) },
    { key: "apn", label: "APN", value: listing.apn ? formatApn(listing.apn) : "—" },
    { key: "submarket", label: "Submarket", value: listing.submarket ?? "—" },
    { key: "city", label: "City", value: listing.city ?? "—" },
    { key: "zip", label: "ZIP", value: listing.zip ?? "—" },
  ];

  const factsCard = (
    <Card>
      <CardHeader>
        <CardTitle>Listing facts</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every value shows its source and when it was received. Cap rate appears only when the
          source states it.
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <dl
          className={
            reviewing
              ? "grid gap-x-6 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"
              : "grid gap-x-6 sm:grid-cols-2"
          }
          data-testid="listing-facts"
        >
          {facts.map((f) => (
            <div key={f.key} className="flex flex-col gap-1 border-b py-2.5" data-field={f.key}>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {f.label}
              </dt>
              <dd className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold tabular">{f.value}</span>
                {f.value !== "—" &&
                  (f.calculated ? (
                    <span className="text-[11px] text-muted-foreground">{f.calculated}</span>
                  ) : (
                    <SourceChip source={sources[f.key]} />
                  ))}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader
        back={{ href: `${base}/deal-finder`, label: "Deal Finder" }}
        title={listing.address}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{[listing.city, listing.state, listing.zip].filter(Boolean).join(", ")}</span>
            <ListingStatusBadge status={listing.status} />
            <VerificationBadge status={listing.verification_status} />
          </span>
        }
        actions={canWrite && <ListingActions listingId={listing.id} status={listing.status} />}
      />

      {reviewing && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="review-banner"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> Needs review — check the parsed values
            against the email
          </p>
          {listing.review_reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {listing.review_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {listing.status === "dismissed" && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">
          Dismissed{listing.dismissed_at ? ` ${formatDate(listing.dismissed_at)}` : ""}
          {listing.dismisser
            ? ` by ${listing.dismisser.full_name ?? listing.dismisser.email}`
            : ""}{" "}
          — {listing.dismissed_reason}
        </p>
      )}

      {listing.status === "promoted" && (
        <p
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          data-testid="promoted-links"
        >
          <span className="font-semibold">
            Promoted{listing.promoted_at ? ` ${formatDate(listing.promoted_at)}` : ""}.
          </span>
          {listing.deal && (
            <Link
              href={`${base}/pipeline?deal=${listing.deal.id}`}
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <CircleDot className="size-3.5" aria-hidden /> Deal: {listing.deal.title}
              {listing.deal.stage ? ` (${listing.deal.stage.name})` : ""}
            </Link>
          )}
          {listing.property && (
            <Link
              href={`${base}/properties/${listing.property.id}`}
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <Building className="size-3.5" aria-hidden /> Property:{" "}
              {listing.property.name ?? listing.property.address}
            </Link>
          )}
        </p>
      )}

      {reviewing && latestEmail ? (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          {factsCard}
          <EmailCard email={latestEmail} />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {!(reviewing && latestEmail) && factsCard}
          <Card>
            <CardContent className="py-4">
              <ScoreBreakdown
                score={listing.score}
                breakdown={listing.score_breakdown}
                scoredAt={listing.scored_at}
                buyBoxHref={isAdmin ? `${base}/settings/buy-box` : null}
                buyBoxEmpty={isBuyBoxEmpty(buyBox)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ListingHistory events={events} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card data-testid="verification-panel">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Verification <VerificationBadge status={listing.verification_status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2 text-sm">
              {listing.verification_status !== "unverified" ? (
                <div className="rounded-md bg-muted px-3 py-2" data-testid="verification-detail">
                  <p>{listing.verification_note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source: {listing.verification_source} ·{" "}
                    {listing.verifier?.full_name ?? listing.verifier?.email ?? "Demo data"} ·{" "}
                    {formatDateTime(listing.verified_at)}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">Not checked against public records yet.</p>
              )}
              <VerifyButtons listingId={listing.id} status={listing.verification_status} />
              <div
                className="rounded-md border border-dashed px-3 py-2 text-xs"
                data-testid="county-status"
              >
                <p className="font-semibold">
                  County lookup: {county.connected ? "Connected" : "Not connected"}
                </p>
                <p className="text-muted-foreground">
                  {county.connected
                    ? county.name
                    : "Automatic San Diego County record checks arrive in Phase 2B. Verify by hand for now."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Broker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-2 text-sm">
              {listing.broker_name ||
              listing.broker_company ||
              listing.broker_phone ||
              listing.broker_email ? (
                <>
                  {listing.broker_name && <p className="font-semibold">{listing.broker_name}</p>}
                  {listing.broker_company && <p>{listing.broker_company}</p>}
                  {listing.broker_phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden /> {formatPhone(listing.broker_phone)}
                    </p>
                  )}
                  {listing.broker_email && (
                    <p className="flex items-center gap-1.5 break-all">
                      <Mail className="size-3.5" aria-hidden /> {listing.broker_email}
                    </p>
                  )}
                  <SourceChip
                    source={sources.broker_name ?? sources.broker_phone ?? sources.broker_email}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">No broker details on this listing.</p>
              )}
              {listing.listing_url && (
                <p className="pt-1">
                  <a
                    href={listing.listing_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-semibold text-brand-accent-text hover:underline"
                  >
                    Original listing <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                  <span className="block text-xs text-muted-foreground">
                    Opens the broker&apos;s page; the app never fetches it.
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arrival</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-2 text-sm">
              <p>
                {labelOf(LISTING_ORIGINS, listing.origin)} · {listing.source_label}
              </p>
              <p className="text-muted-foreground">
                First received {formatDateTime(listing.received_at)}
              </p>
              {listing.last_received_at !== listing.received_at && (
                <p className="text-muted-foreground">
                  Last seen {formatDateTime(listing.last_received_at)}
                </p>
              )}
              {alert && (
                <p className="text-muted-foreground" data-testid="listing-alert">
                  Alert sent in app {formatDateTime(alert.created_at)} (score {alert.score}); email:{" "}
                  {alert.email_status === "sent" ? "sent" : "not connected"}
                </p>
              )}
            </CardContent>
          </Card>

          {!(reviewing && latestEmail) && latestEmail && <EmailCard email={latestEmail} />}
        </div>
      </div>
    </>
  );
}
