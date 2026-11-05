import { ArrowLeft, Check, X } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { SmsSettingsForm, SmsWebhookLinks } from "@/features/outreach/components/sms-settings-form";
import { formatHour } from "@/features/outreach/compliance";
import { getOutreachSettings } from "@/features/outreach/server/queries";
import { getSmsState, smsOffReason } from "@/features/outreach/server/sms-queries";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Texting" };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function Step({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-brand-accent-text" aria-label="Done" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not yet" />
      )}
      <span>{children}</span>
    </li>
  );
}

export default async function SmsSettingsPage({
  params,
}: PageProps<"/w/[slug]/settings/integrations/sms">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const [state, outreach, base] = await Promise.all([
    getSmsState(workspace.id),
    getOutreachSettings(workspace.id),
    origin(),
  ]);
  const off = smsOffReason(state);
  return (
    <div className="space-y-4">
      <Link
        href={`/w/${slug}/settings/integrations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Integrations
      </Link>
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 font-sans text-lg font-bold">
          Texting · Twilio{" "}
          <Badge variant={state.ready ? "success" : "secondary"} data-testid="sms-status">
            {state.ready ? "On" : state.providerConnected ? "Off" : "Not connected"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          One-to-one texts from a contact&apos;s page. A person writes and sends every text; there
          are no automatic or bulk texts. Before anything goes out, the app and the database both
          check: not marked do-not-contact, SMS consent on file, not texted STOP, a mobile number,
          and inside texting hours ({formatHour(outreach.smsSendFrom)}–
          {formatHour(outreach.smsSendUntil)}, set in Settings → Outreach). Blocked attempts are
          logged with the reason.
        </p>
      </div>
      <ul className="space-y-1 rounded-xl border bg-card p-4 text-sm" data-testid="sms-checklist">
        <Step ok={state.providerConnected}>
          Twilio account details added in Vercel (<code>TWILIO_ACCOUNT_SID</code>,{" "}
          <code>TWILIO_AUTH_TOKEN</code>). Keanu or Sam adds them; never paste them in chat.
        </Step>
        <Step ok={Boolean(state.fromNumber || state.messagingServiceSid)}>
          Sending number saved below. For business texting in the US, Twilio requires A2P 10DLC
          registration of the brand and campaign first; that has a fee, so it waits for Sam&apos;s
          go-ahead.
        </Step>
        <Step ok={state.hasWebhook}>Receiving link pasted into the Twilio number.</Step>
        <Step ok={state.enabled}>Texting switched on.</Step>
      </ul>
      {off && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="sms-off-reason">
          {off} Nothing can be sent until every step above is done.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <SmsSettingsForm
          providerConnected={state.providerConnected}
          initial={{
            enabled: state.enabled,
            fromNumber: state.fromNumber ?? "",
            messagingServiceSid: state.messagingServiceSid ?? "",
            helpReply: state.helpReply ?? "",
          }}
        />
        <SmsWebhookLinks base={base} hasWebhook={state.hasWebhook} />
      </div>
    </div>
  );
}
