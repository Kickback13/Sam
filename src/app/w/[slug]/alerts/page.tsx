import { Bell, MailX, MessageSquareOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { AlertLink, MarkAllReadButton } from "@/features/h4a/components/alert-buttons";
import {
  ListingStatusBadge,
  ScoreBadge,
  VerificationBadge,
} from "@/features/h4a/components/badges";
import { alertEmailConfig } from "@/features/h4a/alerts/email";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { ensureFreshScores } from "@/features/h4a/server/fresh-scores";
import { listAlerts, LISTINGS_PAGE_SIZE, unreadAlertCount } from "@/features/h4a/server/queries";
import { loadBuyBox } from "@/features/h4a/server/rescore";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage({ params, searchParams }: PageProps<"/w/[slug]/alerts">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite, isAdmin } = await getRealEstateContext(slug);
  await ensureFreshScores(workspace.id, canWrite);
  const unreadOnly = sp.view === "unread";
  const page = Number(sp.page ?? 1) || 1;
  const [{ rows, total }, unread, buyBox] = await Promise.all([
    listAlerts(workspace.id, { unread: unreadOnly, page }),
    unreadAlertCount(workspace.id),
    loadBuyBox(await createClient(), workspace.id),
  ]);
  const email = alertEmailConfig();
  const base = `/w/${slug}`;

  return (
    <>
      <PageHeader
        title="Alerts"
        description={`A new or updated listing that scores ${buyBox.alertThreshold}+ against your buy box · ${formatNumber(unread)} unread`}
        actions={<MarkAllReadButton disabled={unread === 0} />}
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2" data-testid="alert-channels">
        <div className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm">
          <MailX className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            <strong>Email to the owner: {email.enabled ? "On" : "Not connected"}.</strong>{" "}
            <span className="text-muted-foreground">
              {email.enabled
                ? "Each new alert is emailed to the workspace owner only."
                : "Built and switched off until Resend is set up on Sam's account."}
            </span>
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm">
          <MessageSquareOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            <strong>Text messages: off.</strong>{" "}
            <span className="text-muted-foreground">No SMS alerts in this phase.</span>
          </p>
        </div>
      </div>

      <nav aria-label="Alert views" className="mb-3 flex gap-1">
        {[
          { label: "All", href: `${base}/alerts`, active: !unreadOnly },
          {
            label: `Unread (${formatNumber(unread)})`,
            href: `${base}/alerts?view=unread`,
            active: unreadOnly,
          },
        ].map((v) => (
          <Link
            key={v.label}
            href={v.href}
            aria-current={v.active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold",
              v.active ? "bg-brand-ink text-white" : "border bg-card hover:bg-accent",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "Nothing unread" : "No alerts yet"}
          description={`When a new listing scores ${buyBox.alertThreshold} or more, it shows up here and on Today.`}
          actions={
            isAdmin && (
              <Link
                href={`${base}/settings/buy-box`}
                className="text-sm font-semibold text-brand-accent-text hover:underline"
              >
                Buy box and alert threshold
              </Link>
            )
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="alert-list">
          {rows.map((a) => {
            const l = a.listing;
            const unreadRow = !a.read_at;
            return (
              <li
                key={a.id}
                data-testid="alert-row"
                data-unread={unreadRow ? "true" : "false"}
                className={cn(
                  "rounded-xl border bg-card px-4 py-3",
                  unreadRow && "border-l-4 border-l-brand-primary",
                )}
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={l?.score ?? a.score} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {l ? (
                        <AlertLink
                          alertId={a.id}
                          unread={unreadRow}
                          href={`${base}/deal-finder/${l.id}`}
                        >
                          {unreadRow && <span className="sr-only">Unread: </span>}
                          {l.address}
                        </AlertLink>
                      ) : (
                        <span className="font-semibold">Listing removed</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {unreadRow ? "New · " : ""}
                        {formatRelative(a.created_at)}
                      </span>
                    </div>
                    {l && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {[l.city, l.zip].filter(Boolean).join(", ")} · {formatCurrency(l.price)} ·{" "}
                          {formatNumber(l.units)} units ·{" "}
                          {formatCurrency(
                            l.price_per_unit === null ? null : Number(l.price_per_unit),
                          )}
                          /unit
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <ListingStatusBadge status={l.status} />
                          <VerificationBadge status={l.verification_status} />
                          <span className="text-muted-foreground">
                            {a.reason === "updated_listing" ? "Updated listing" : "New listing"} ·
                            scored {a.score} when it arrived · {l.source_label}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        pageSize={LISTINGS_PAGE_SIZE}
        total={total}
        hrefFor={(p) => {
          const q = new URLSearchParams();
          if (unreadOnly) q.set("view", "unread");
          if (p > 1) q.set("page", String(p));
          return `${base}/alerts${q.size ? `?${q}` : ""}`;
        }}
      />
    </>
  );
}
