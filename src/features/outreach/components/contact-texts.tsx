import { MessageSquare, MessageSquareOff } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { checkSms, type SmsConsent } from "../compliance";
import {
  gateSettings,
  getOutreachSettings,
  suppressionsForContact,
  toGateContact,
} from "../server/queries";
import { getSmsState, getSmsThread, smsOffReason } from "../server/sms-queries";
import { SmsComposer } from "./sms-composer";

const STATUS: Record<
  string,
  { label: string; variant: "success" | "info" | "warning" | "danger" | "secondary" }
> = {
  queued: { label: "Sending", variant: "secondary" },
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  undelivered: { label: "Not delivered", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
  blocked: { label: "Blocked", variant: "warning" },
};

/** Texts card on a contact page: the thread, and a composer behind the TCPA gates. */
export async function ContactTexts({
  workspaceId,
  slug,
  isAdmin,
  contact,
}: {
  workspaceId: string;
  slug: string;
  isAdmin: boolean;
  contact: {
    id: string;
    dnc: boolean;
    sms_consent: SmsConsent;
    sms_consent_at: string | null;
    email_opt_out: boolean;
    emails: unknown;
    phones: unknown;
  };
}) {
  const gc = toGateContact(contact);
  const [state, thread, outreach, suppressions] = await Promise.all([
    getSmsState(workspaceId),
    getSmsThread(workspaceId, contact.id),
    getOutreachSettings(workspaceId),
    suppressionsForContact(workspaceId, gc),
  ]);
  const gate = checkSms(gc, gateSettings(outreach), suppressions, "informational", new Date());
  const off = smsOffReason(state);
  const disabledReason =
    off ?? (gate.allowed ? null : gate.blocks.map((b) => b.message).join("; "));

  return (
    <Card data-testid="contact-texts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4" aria-hidden /> Texts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-1 text-sm">
        {off ? (
          <p
            className="flex items-start gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
            data-testid="sms-off"
          >
            <MessageSquareOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{off}</span> Nothing is sent from here until texting
              is set up and switched on
              {isAdmin ? (
                <>
                  {" "}
                  in{" "}
                  <Link href={`/w/${slug}/settings/integrations/sms`} className="underline">
                    Settings → Integrations → Texting
                  </Link>
                </>
              ) : null}
              .
            </span>
          </p>
        ) : (
          !gate.allowed && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs" data-testid="sms-gate">
              Can&apos;t text this contact: {gate.blocks.map((b) => b.message).join("; ")}.
            </p>
          )
        )}

        {thread.length > 0 && (
          <ol className="space-y-2" data-testid="sms-thread">
            {thread.map((m) => (
              <li
                key={m.id}
                data-direction={m.direction}
                data-status={m.status}
                className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.direction === "out" ? "bg-brand-surface" : "bg-muted",
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span title={formatDateTime(m.createdAt)}>{formatDateTime(m.createdAt)}</span>
                    {m.direction === "out" && m.senderName && <span>· {m.senderName}</span>}
                    {m.direction === "out" && STATUS[m.status] && (
                      <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
                    )}
                  </p>
                  {m.status === "blocked" && m.blocks.length > 0 && (
                    <p className="mt-1 text-[11px]">{m.blocks.map((b) => b.message).join("; ")}</p>
                  )}
                  {m.error && <p className="mt-1 text-[11px] text-brand-danger">{m.error}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        <SmsComposer contactId={contact.id} disabledReason={disabledReason} />
      </CardContent>
    </Card>
  );
}
