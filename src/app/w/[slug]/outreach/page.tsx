import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { outreachEmailConfig } from "@/features/outreach/email-provider";
import { NewNewsletterButton } from "@/features/outreach/components/new-newsletter-button";
import {
  OutreachStatus,
  OutreachTabs,
  STATUS_BADGE,
} from "@/features/outreach/components/outreach-chrome";
import { getOutreachSettings, listNewsletters } from "@/features/outreach/server/queries";
import { formatDate, formatNumber } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Outreach" };

export default async function OutreachPage({ params }: PageProps<"/w/[slug]/outreach">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const [newsletters, settings] = await Promise.all([
    listNewsletters(workspace.id),
    getOutreachSettings(workspace.id),
  ]);

  return (
    <>
      <PageHeader
        title="Outreach"
        description={`Newsletters to ${workspace.name} contacts. Every email passes the DNC, opt-out and CAN-SPAM checks first; blocked contacts are listed with the reason.`}
        actions={<NewNewsletterButton />}
      />
      <OutreachTabs slug={slug} active="newsletters" />
      <OutreachStatus slug={slug} email={outreachEmailConfig()} settings={settings} />
      {newsletters.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No newsletters yet"
          description="Write one here, preview it, and check who it would reach. You can copy it to your other workspace — each business keeps its own list."
        />
      ) : (
        <ul className="space-y-2" data-testid="newsletter-list">
          {newsletters.map((n) => {
            const badge = STATUS_BADGE[n.status];
            return (
              <li key={n.id} className="rounded-xl border bg-card p-4" data-testid="newsletter-row">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/w/${slug}/outreach/newsletters/${n.id}`}
                      className="font-semibold break-words hover:underline"
                    >
                      {n.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {n.status === "sent" && n.sentAt
                        ? `Sent ${formatDate(n.sentAt)} · ${formatNumber(n.sentCount)} delivered to Resend · ${formatNumber(n.blockedCount)} blocked${n.failedCount ? ` · ${formatNumber(n.failedCount)} failed` : ""}`
                        : `Edited ${formatDate(n.updatedAt)}`}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
