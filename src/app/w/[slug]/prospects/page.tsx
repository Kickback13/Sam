import { Info, Trophy, UserRoundSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddBrokerButton } from "@/features/h4a/components/add-broker-button";
import { BROKER_SORTS, DEFAULT_MIN_YEARS, type BrokerSort } from "@/features/h4a/prospects/rank";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { listBrokers, listLongHoldOwners } from "@/features/h4a/server/prospects";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Prospects" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const intParam = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Phase 4B: who to call. Brokers ranked by the listings Sam actually received from them, and
 * owners who have held a property for years (by last sale date). Lists only — nothing is sent.
 */
export default async function ProspectsPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/prospects">) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = first(sp.tab) === "owners" ? "owners" : "brokers";
  const { workspace } = await getRealEstateContext(slug);

  return (
    <>
      <PageHeader
        title="Prospects"
        description="Who to call next, from data already in this workspace. Brokers are ranked by the listings you received from them; long-hold owners come from each property's last sale date. Lists only: nothing is sent from here."
      />
      <nav aria-label="Prospects" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {[
          ["brokers", "Brokers"],
          ["owners", "Long-hold owners"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/w/${slug}/prospects${key === "owners" ? "?tab=owners" : ""}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
              tab === key ? "border-brand-ink text-foreground" : "border-transparent",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "brokers" ? (
        <BrokersTab
          slug={slug}
          workspaceId={workspace.id}
          sort={
            (BROKER_SORTS.find((s) => s.value === first(sp.sort))?.value ??
              "listings") as BrokerSort
          }
        />
      ) : (
        <OwnersTab
          slug={slug}
          workspaceId={workspace.id}
          minYears={intParam(first(sp.years), 1, 60) ?? DEFAULT_MIN_YEARS}
          minUnits={intParam(first(sp.units), 1, 1000)}
          zip={/^\d{5}$/.test(first(sp.zip) ?? "") ? (first(sp.zip) as string) : null}
        />
      )}
    </>
  );
}

async function BrokersTab({
  slug,
  workspaceId,
  sort,
}: {
  slug: string;
  workspaceId: string;
  sort: BrokerSort;
}) {
  const { brokers, listingsRead, truncated } = await listBrokers(workspaceId, sort);
  if (!brokers.length)
    return (
      <EmptyState
        icon={Trophy}
        title="No brokers yet"
        description="Brokers appear here as listings arrive in Deal Finder with a broker's name, email or phone (forwarded alerts, pasted emails or CSV uploads)."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/w/${slug}/deal-finder`}>Open Deal Finder</Link>
          </Button>
        }
      />
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" data-testid="broker-summary">
          {formatNumber(brokers.length)} brokers from {formatNumber(listingsRead)} listings
          {truncated ? " (the most recent 10,000)" : ""}. A match is a listing scoring 70+ on your
          buy box.
        </p>
        <nav aria-label="Sort brokers" className="flex flex-wrap gap-1">
          {BROKER_SORTS.map((s) => (
            <Link
              key={s.value}
              href={`/w/${slug}/prospects${s.value === "listings" ? "" : `?sort=${s.value}`}`}
              aria-current={sort === s.value ? "true" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                sort === s.value ? "border-brand-ink bg-brand-ink text-white" : "hover:bg-muted",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
      <ol className="divide-y rounded-xl border bg-card" data-testid="broker-list">
        {brokers.map((b, i) => (
          <li
            key={b.key}
            className="flex flex-wrap items-start gap-3 p-3 text-sm"
            data-testid="broker-row"
          >
            <span className="w-6 shrink-0 pt-0.5 text-right font-bold text-muted-foreground tabular">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold">
                {b.name ?? b.email ?? (b.phone ? formatPhone(b.phone) : "Unnamed broker")}
                {b.company && (
                  <span className="font-normal text-muted-foreground"> · {b.company}</span>
                )}
              </p>
              <p className="text-xs break-words text-muted-foreground">
                {[b.email, b.phone ? formatPhone(b.phone) : null].filter(Boolean).join(" · ") ||
                  "No email or phone on their listings"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last listing {formatDate(b.lastListedAt)}
                {b.topZips.length ? ` · mostly ${b.topZips.join(", ")}` : ""}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6">
              {[
                ["Listings", formatNumber(b.listings)],
                ["Matches", formatNumber(b.matches)],
                ["Units", formatNumber(b.units)],
                ["Volume", b.volume ? formatCurrency(b.volume) : "—"],
                ["In pipeline", formatNumber(b.promoted)],
                ["Closed", formatNumber(b.closed)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="ml-auto shrink-0">
              {b.contactId ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/w/${slug}/people/${b.contactId}`} data-testid="broker-contact">
                    In People →
                  </Link>
                </Button>
              ) : (
                <AddBrokerButton
                  name={b.name}
                  company={b.company}
                  email={b.email}
                  phone={b.phone}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function OwnersTab({
  slug,
  workspaceId,
  minYears,
  minUnits,
  zip,
}: {
  slug: string;
  workspaceId: string;
  minYears: number;
  minUnits: number | null;
  zip: string | null;
}) {
  const { owners, withoutSaleDate, truncated } = await listLongHoldOwners(workspaceId, {
    minYears,
    minUnits,
    zip,
  });
  return (
    <div className="space-y-3">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 text-sm"
        data-testid="owner-filters"
      >
        <input type="hidden" name="tab" value="owners" />
        <div className="space-y-1">
          <Label htmlFor="years" className="text-xs">
            Held at least (years)
          </Label>
          <Input
            id="years"
            name="years"
            type="number"
            min={1}
            max={60}
            defaultValue={minYears}
            className="w-28"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="units" className="text-xs">
            Min. units
          </Label>
          <Input
            id="units"
            name="units"
            type="number"
            min={1}
            max={1000}
            defaultValue={minUnits ?? ""}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="zip" className="text-xs">
            ZIP
          </Label>
          <Input
            id="zip"
            name="zip"
            inputMode="numeric"
            pattern="[0-9]{5}"
            defaultValue={zip ?? ""}
            className="w-24"
          />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
      </form>
      {withoutSaleDate > 0 && (
        <p
          className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm"
          data-testid="owners-missing"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formatNumber(withoutSaleDate)} propert{withoutSaleDate === 1 ? "y has" : "ies have"} no
          last sale date yet, so {withoutSaleDate === 1 ? "it isn't" : "they aren't"} in this list.
          Add it on the property (from the county record) to include{" "}
          {withoutSaleDate === 1 ? "it" : "them"}.
        </p>
      )}
      {owners.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title={`No properties held ${minYears}+ years`}
          description="Owners appear here when a property's last sale date is at least that long ago. Sale dates come from county records, imports or what you enter on the property."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="owner-summary">
            {formatNumber(owners.length)} propert{owners.length === 1 ? "y" : "ies"} held {minYears}
            + years
            {truncated ? " (first 2,000, longest held first)" : ", longest held first"}.
          </p>
          <ul className="divide-y rounded-xl border bg-card" data-testid="owner-list">
            {owners.map((o) => (
              <li
                key={o.propertyId}
                className="flex flex-wrap items-start gap-3 p-3 text-sm"
                data-testid="owner-row"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <Link
                    href={`/w/${slug}/properties/${o.propertyId}`}
                    className="font-semibold hover:underline"
                  >
                    {o.address ?? "Property"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[o.city, o.zip].filter(Boolean).join(" ")}
                    {o.units ? ` · ${formatNumber(o.units)} units` : ""}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-semibold">Held {o.yearsHeld} years</span> · last sold{" "}
                    {formatDate(o.lastSaleDate)}
                    {o.lastSalePrice ? ` for ${formatCurrency(o.lastSalePrice)}` : ""}
                    <span className="text-muted-foreground">
                      {" "}
                      · source: {o.saleDateSource ?? "not recorded"}
                    </span>
                  </p>
                </div>
                <div className="min-w-0 basis-48 text-xs">
                  {o.owner ? (
                    <>
                      <Link
                        href={`/w/${slug}/${o.owner.kind === "contact" ? "people" : "companies"}/${o.owner.id}`}
                        className="font-semibold hover:underline"
                      >
                        {o.owner.name}
                      </Link>
                      {o.owner.kind === "contact" && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {o.owner.dnc && <Badge variant="danger">Do not call</Badge>}
                          {o.owner.emailOptOut && <Badge variant="warning">Unsubscribed</Badge>}
                          {!o.owner.hasPhone && !o.owner.hasEmail && (
                            <Badge variant="secondary">No phone or email</Badge>
                          )}
                          {o.owner.smsConsent === "none" && o.owner.hasPhone && (
                            <Badge variant="secondary">No text consent</Badge>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Owner not linked yet</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
