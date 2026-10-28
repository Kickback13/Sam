import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { planNewsletter } from "@/features/outreach/audience";
import { BLOCK_LABELS, type BlockCode } from "@/features/outreach/compliance";
import { outreachEmailConfig } from "@/features/outreach/email-provider";
import { NewsletterEditor } from "@/features/outreach/components/newsletter-editor";
import { OutreachStatus, STATUS_BADGE } from "@/features/outreach/components/outreach-chrome";
import {
  copyTargets,
  gateSettings,
  getNewsletter,
  getOutreachSettings,
  listSends,
  loadAudienceContacts,
  loadSuppressions,
} from "@/features/outreach/server/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Newsletter" };

const SEND_STATUS = {
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  blocked: { label: "Blocked", variant: "warning" },
  queued: { label: "Queued", variant: "secondary" },
} as const;

export default async function NewsletterPage({
  params,
}: PageProps<"/w/[slug]/outreach/newsletters/[id]">) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { workspace, workspaces } = await getWorkspaceContext(slug);
  const [newsletter, settings] = await Promise.all([
    getNewsletter(workspace.id, id),
    getOutreachSettings(workspace.id),
  ]);
  if (!newsletter) notFound();
  const badge = STATUS_BADGE[newsletter.status];
  const email = outreachEmailConfig();

  const back = (
    <Link
      href={`/w/${slug}/outreach`}
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Newsletters
    </Link>
  );

  if (newsletter.status !== "draft") {
    const sends = await listSends(workspace.id, id);
    return (
      <>
        {back}
        <PageHeader
          title={newsletter.subject}
          description={
            newsletter.sentAt ? `Sent ${formatDateTime(newsletter.sentAt)}` : "Sending in progress"
          }
          actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
        />
        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="send-report">
          {[
            ["Matched", newsletter.recipientCount],
            ["Sent", newsletter.sentCount],
            ["Blocked", newsletter.blockedCount],
            ["Failed", newsletter.failedCount],
          ].map(([label, n]) => (
            <div key={label} className="rounded-md border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular">{formatNumber(n as number)}</dd>
            </div>
          ))}
        </dl>
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {sends.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2">
              <div className="min-w-0">
                {s.contactId ? (
                  <Link
                    href={`/w/${slug}/people/${s.contactId}`}
                    className="font-medium hover:underline"
                  >
                    {s.contactName ?? s.email}
                  </Link>
                ) : (
                  <span className="font-medium">{s.email}</span>
                )}
                <p className="text-xs break-all text-muted-foreground">
                  {s.email}
                  {s.blockedReasons.length > 0 &&
                    ` — ${s.blockedReasons.map((r) => BLOCK_LABELS[r as BlockCode] ?? r).join(", ")}`}
                  {s.error ? ` — ${s.error}` : ""}
                  {s.unsubscribedAt ? ` — unsubscribed ${formatDateTime(s.unsubscribedAt)}` : ""}
                </p>
              </div>
              <Badge variant={SEND_STATUS[s.status].variant}>{SEND_STATUS[s.status].label}</Badge>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const [contacts, suppressions] = await Promise.all([
    loadAudienceContacts(workspace.id),
    loadSuppressions(workspace.id),
  ]);
  const plan = planNewsletter(contacts, newsletter.audience, gateSettings(settings), suppressions);
  const blocked = plan.recipients.filter((r) => !r.duplicate && !r.gate.allowed);

  return (
    <>
      {back}
      <PageHeader
        title={newsletter.subject}
        description={`Draft for ${workspace.name}. Sends to this workspace's contacts only.`}
        actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
      />
      <OutreachStatus slug={slug} email={email} settings={settings} />
      <NewsletterEditor
        key={newsletter.updatedAt}
        newsletter={newsletter}
        footer={{
          senderName: settings.senderName,
          mailingAddress: settings.mailingAddress,
          workspaceName: workspace.name,
        }}
        check={{
          matched: plan.matched,
          sendable: plan.sendable.length,
          duplicates: plan.duplicates,
          byCode: plan.summary.byCode,
          blockedSample: blocked.slice(0, 50).map((r) => ({
            contactId: r.contactId,
            name: r.name,
            email: r.email,
            reasons: r.gate.blocks.map((b) => b.code),
          })),
        }}
        email={{ enabled: email.enabled, reason: email.reason }}
        copyTargets={copyTargets(workspaces, workspace.id).map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
        }))}
      />
    </>
  );
}
