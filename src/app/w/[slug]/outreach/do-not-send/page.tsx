import { ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { OutreachTabs } from "@/features/outreach/components/outreach-chrome";
import {
  AddSuppressionForm,
  RemoveSuppressionButton,
} from "@/features/outreach/components/suppression-controls";
import { listSuppressions } from "@/features/outreach/server/queries";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Do-not-send list" };

const REASONS: Record<string, string> = {
  unsubscribe: "Unsubscribed",
  stop: "Texted STOP",
  manual: "Added by hand",
  bounce: "Bounced",
  complaint: "Marked as spam",
};

export default async function DoNotSendPage({
  params,
}: PageProps<"/w/[slug]/outreach/do-not-send">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const rows = await listSuppressions(workspace.id);
  return (
    <>
      <PageHeader
        title="Outreach"
        description={`Emails and phone numbers ${workspace.name} never sends to, whatever the contact record says. Unsubscribe links add to this list automatically.`}
      />
      <OutreachTabs slug={slug} active="do-not-send" />
      <AddSuppressionForm />
      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldOff}
          title="Nobody on the list"
          description="When someone unsubscribes or texts STOP, they show up here."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card text-sm" data-testid="suppression-list">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 px-4 py-2"
              data-value={r.value}
            >
              <div className="min-w-0">
                <p className="font-medium break-all">
                  {r.channel === "sms" ? formatPhone(r.value) : r.value}{" "}
                  <Badge variant="secondary">{r.channel === "sms" ? "Text" : "Email"}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {REASONS[r.reason] ?? r.reason} · {formatDateTime(r.createdAt)}
                  {r.createdByName ? ` · by ${r.createdByName}` : ""}
                  {r.contactId && (
                    <>
                      {" · "}
                      <Link href={`/w/${slug}/people/${r.contactId}`} className="underline">
                        {r.contactName ?? "contact"}
                      </Link>
                    </>
                  )}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <RemoveSuppressionButton id={r.id} value={r.value} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
