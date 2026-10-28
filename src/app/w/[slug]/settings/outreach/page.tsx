import type { Metadata } from "next";

import { OutreachSettingsForm } from "@/features/outreach/components/outreach-settings-form";
import { getOutreachSettings } from "@/features/outreach/server/queries";
import { formatDateTime } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Outreach settings" };

export default async function OutreachSettingsPage({
  params,
}: PageProps<"/w/[slug]/settings/outreach">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getWorkspaceContext(slug);
  const s = await getOutreachSettings(workspace.id);
  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Sender details and texting hours for {workspace.name}. The outreach checks use these
          before anything is sent; each workspace has its own.
        </p>
        {s.updatedAt && (
          <p className="text-xs" data-testid="outreach-settings-meta">
            Last saved {formatDateTime(s.updatedAt)}
          </p>
        )}
        {!isAdmin && (
          <p className="rounded-md bg-muted px-3 py-2">
            Only owners and admins can change outreach settings.
          </p>
        )}
      </div>
      <OutreachSettingsForm
        readOnly={!isAdmin}
        initial={{
          sender_name: s.senderName ?? "",
          from_email: s.fromEmail ?? "",
          reply_to: s.replyTo ?? "",
          mailing_address: s.mailingAddress ?? "",
          time_zone: s.timeZone,
          sms_send_from: String(s.smsSendFrom),
          sms_send_until: String(s.smsSendUntil),
        }}
      />
    </div>
  );
}
