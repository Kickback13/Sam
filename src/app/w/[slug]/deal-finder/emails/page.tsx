import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { listInboundEmails, LISTINGS_PAGE_SIZE } from "@/features/h4a/server/queries";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Listing emails" };

const STATUS = {
  pending: { label: "Waiting", variant: "secondary" },
  parsed: { label: "Parsed", variant: "success" },
  no_listings: { label: "No listings", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
} as const;

const CHANNEL = { resend: "Forwarded", paste: "Pasted", demo: "Demo (placeholder)" } as const;

export default async function EmailsPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/deal-finder/emails">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace } = await getRealEstateContext(slug);
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total } = await listInboundEmails(workspace.id, page);
  const base = `/w/${slug}/deal-finder`;
  return (
    <>
      <PageHeader
        back={{ href: base, label: "Deal Finder" }}
        title="Listing emails"
        description={`${formatNumber(total)} ${total === 1 ? "email" : "emails"} — forwarded alerts and pasted emails, kept with what was read from each`}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No emails yet"
          description="Forwarded alert emails appear here once Resend inbound is connected (Settings → Integrations). Admins can test with “Paste an email” now."
        />
      ) : (
        <ul className="space-y-2" data-testid="email-list">
          {rows.map((e) => {
            const s = STATUS[e.parse_status as keyof typeof STATUS] ?? STATUS.pending;
            const notes = Array.isArray(e.parse_notes) ? (e.parse_notes as string[]) : [];
            return (
              <li key={e.id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`${base}/emails/${e.id}`}
                    className="min-w-0 font-semibold break-words hover:underline"
                  >
                    {e.subject ?? "(no subject)"}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(e.received_at)}
                  </span>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                  {e.from_address ?? "Unknown sender"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant={s.variant}>{s.label}</Badge>
                  <Badge variant="outline">
                    {CHANNEL[e.channel as keyof typeof CHANNEL] ?? e.channel}
                  </Badge>
                  {e.parser_label && (
                    <span className="text-muted-foreground">{e.parser_label}</span>
                  )}
                  {e.listing_count > 0 && (
                    <span className="text-muted-foreground">
                      · {e.listing_count} {e.listing_count === 1 ? "listing" : "listings"}
                    </span>
                  )}
                </div>
                {(e.error || notes[0]) && (
                  <p className="mt-1 text-xs text-muted-foreground">{e.error ?? notes[0]}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        pageSize={LISTINGS_PAGE_SIZE}
        total={total}
        hrefFor={(p) => `${base}/emails${p > 1 ? `?page=${p}` : ""}`}
      />
    </>
  );
}
