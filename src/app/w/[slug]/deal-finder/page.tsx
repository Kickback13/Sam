import { ClipboardPaste, Inbox, Mail, Plus, Radar, SlidersHorizontal, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/features/h4a/components/listing-card";
import {
  LISTING_ORIGINS,
  LISTING_STATUSES,
  SCORE_BANDS,
  VERIFICATION_STATUSES,
} from "@/features/h4a/constants";
import { isBuyBoxEmpty } from "@/features/h4a/scoring/score";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { ensureFreshScores } from "@/features/h4a/server/fresh-scores";
import {
  listingZips,
  listListings,
  LISTINGS_PAGE_SIZE,
  type ListingFilters,
} from "@/features/h4a/server/queries";
import { loadBuyBox } from "@/features/h4a/server/rescore";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deal Finder" };

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

export default async function DealFinderPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/deal-finder">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite, isAdmin } = await getRealEstateContext(slug);
  await ensureFreshScores(workspace.id, canWrite);

  const f: ListingFilters = {
    status: pick(sp.status, [
      "open",
      "all",
      "new",
      "needs_review",
      "dismissed",
      "promoted",
    ] as const),
    band: pick(sp.band, ["high", "medium", "low", "unscored"] as const),
    origin: pick(
      sp.origin,
      LISTING_ORIGINS.map((o) => o.value),
    ),
    verification: pick(sp.verification, ["unverified", "verified", "mismatch"] as const),
    zip: typeof sp.zip === "string" && /^\d{3,5}$/.test(sp.zip) ? sp.zip : undefined,
    q: typeof sp.q === "string" ? sp.q : undefined,
    sort: pick(sp.sort, ["score", "newest"] as const),
    page: Number(sp.page ?? 1) || 1,
  };
  const [{ rows, total }, zips, buyBox] = await Promise.all([
    listListings(workspace.id, f),
    listingZips(workspace.id),
    loadBuyBox(await createClient(), workspace.id),
  ]);
  const base = `/w/${slug}/deal-finder`;
  const filtered = Boolean(
    f.band || f.origin || f.verification || f.zip || f.q || (f.status && f.status !== "open"),
  );
  const views = [
    { label: "Open", href: base, active: !filtered },
    {
      label: "Needs review",
      href: `${base}?status=needs_review`,
      active: f.status === "needs_review",
    },
    {
      label: "Verification queue",
      href: `${base}?verification=unverified&sort=score`,
      active: f.verification === "unverified" && !f.status,
    },
    { label: "High scores", href: `${base}?band=high`, active: f.band === "high" && !f.status },
  ];

  return (
    <>
      <PageHeader
        title="Deal Finder"
        description={`${formatNumber(total)} ${total === 1 ? "listing" : "listings"} · every value shows its source and when it was received`}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/emails`}>
                <Mail aria-hidden /> Emails
              </Link>
            </Button>
            {isAdmin && (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/paste`} data-testid="paste-email-link">
                  <ClipboardPaste aria-hidden /> Paste an email
                </Link>
              </Button>
            )}
            {canWrite && (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/import`}>
                    <Upload aria-hidden /> Upload CSV
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`${base}/new`} data-testid="new-listing">
                    <Plus aria-hidden /> Add listing
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      {isBuyBoxEmpty(buyBox) && (
        <div
          className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          data-testid="buy-box-banner"
        >
          <p>
            <strong>No buy box yet.</strong> Listings can&apos;t be scored until the buy box is set.
          </p>
          {isAdmin ? (
            <Button asChild size="sm" variant="dark">
              <Link href={`/w/${slug}/settings/buy-box`}>
                <SlidersHorizontal aria-hidden /> Set your buy box
              </Link>
            </Button>
          ) : (
            <p className="text-xs">Ask an owner or admin to set it.</p>
          )}
        </div>
      )}

      <nav aria-label="Deal Finder views" className="mb-3 flex gap-1 overflow-x-auto">
        {views.map((v) => (
          <Link
            key={v.label}
            href={v.href}
            aria-current={v.active ? "page" : undefined}
            className={
              v.active
                ? "shrink-0 rounded-full bg-brand-ink px-3 py-1.5 text-sm font-semibold text-white"
                : "shrink-0 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
            }
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <ListFilters
        values={{
          q: f.q,
          status: f.status,
          band: f.band,
          origin: f.origin,
          zip: f.zip,
          verification: f.verification,
          sort: f.sort,
        }}
        placeholder="Search address, APN, broker…"
        selects={[
          {
            key: "status",
            label: "Status",
            allLabel: "Open listings",
            options: [
              ...LISTING_STATUSES.map((s) => ({ value: s.value, label: s.label })),
              { value: "all", label: "All statuses" },
            ],
          },
          {
            key: "band",
            label: "Score",
            allLabel: "Any score",
            options: SCORE_BANDS.map((b) => ({ value: b.value, label: b.label })),
          },
          {
            key: "origin",
            label: "Source",
            allLabel: "Any source",
            options: LISTING_ORIGINS.map((o) => ({ value: o.value, label: o.label })),
          },
          {
            key: "verification",
            label: "Verification",
            allLabel: "Any verification",
            options: VERIFICATION_STATUSES.map((v) => ({ value: v.value, label: v.label })),
          },
          {
            key: "zip",
            label: "ZIP",
            allLabel: "Any ZIP",
            options: zips.map((z) => ({ value: z, label: z })),
          },
          {
            key: "sort",
            label: "Sort",
            allLabel: "Highest score",
            options: [{ value: "newest", label: "Newest first" }],
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={filtered ? Radar : Inbox}
          title={filtered ? "No listings match" : "No listings yet"}
          description={
            filtered
              ? "Try a different filter."
              : "Listings arrive from alert emails you forward, CSV exports and manual entry — never from scraping. Each one is scored against your buy box."
          }
          actions={
            !filtered &&
            canWrite && (
              <>
                <Button asChild>
                  <Link href={`${base}/new`}>
                    <Plus aria-hidden /> Add a listing
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`${base}/import`}>
                    <Upload aria-hidden /> Upload a CSV
                  </Link>
                </Button>
                {isAdmin && (
                  <Button asChild variant="outline">
                    <Link href={`${base}/paste`}>
                      <ClipboardPaste aria-hidden /> Paste an email
                    </Link>
                  </Button>
                )}
              </>
            )
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="listing-list">
          {rows.map((l) => (
            <ListingCard key={l.id} listing={l} href={`${base}/${l.id}`} />
          ))}
        </ul>
      )}
      <Pagination
        page={f.page ?? 1}
        pageSize={LISTINGS_PAGE_SIZE}
        total={total}
        hrefFor={(page) => {
          const p = new URLSearchParams();
          for (const [k, v] of Object.entries({ ...f, page: undefined }))
            if (v !== undefined && v !== "") p.set(k, String(v));
          if (page > 1) p.set("page", String(page));
          return `${base}${p.size ? `?${p}` : ""}`;
        }}
      />
    </>
  );
}
