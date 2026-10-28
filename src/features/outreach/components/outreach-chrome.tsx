import { MailCheck, MailX, MessageSquareOff, Settings2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { EmailConfig } from "../email-provider";
import type { OutreachSettings } from "../server/queries";

export const STATUS_BADGE = {
  draft: { label: "Draft", variant: "secondary" },
  sending: { label: "Sending", variant: "info" },
  sent: { label: "Sent", variant: "success" },
} as const;

export function OutreachTabs({
  slug,
  active,
}: {
  slug: string;
  active: "newsletters" | "do-not-send";
}) {
  const tabs = [
    { key: "newsletters", href: `/w/${slug}/outreach`, label: "Newsletters" },
    { key: "do-not-send", href: `/w/${slug}/outreach/do-not-send`, label: "Do-not-send list" },
  ] as const;
  return (
    <nav aria-label="Outreach" className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
            active === t.key ? "border-brand-ink text-foreground" : "border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Email / texting connection state + missing sender details. Never pretends to be connected. */
export function OutreachStatus({
  slug,
  email,
  settings,
}: {
  slug: string;
  email: EmailConfig;
  settings: OutreachSettings;
}) {
  const missing = [
    !settings.senderName && "sender name",
    !settings.fromEmail && "From address",
    !settings.mailingAddress && "mailing address",
  ].filter(Boolean) as string[];
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2" data-testid="outreach-status">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
        {email.enabled ? (
          <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
        ) : (
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div>
          <p className="font-semibold" data-testid="email-connection">
            Email: {email.enabled ? "Connected (Resend)" : "Not connected"}
          </p>
          <p className="text-xs text-muted-foreground">
            {email.enabled
              ? "Newsletters send through Resend after every check passes."
              : `${email.reason} Drafts, previews and the audience check all work; Send stays off.`}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
        <MessageSquareOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-semibold">Texting: Not connected</p>
          <p className="text-xs text-muted-foreground">
            No texting provider yet. The consent, STOP and quiet-hours checks are built and show on
            each contact; sending texts comes with the provider.
          </p>
        </div>
      </div>
      {missing.length > 0 && (
        <p
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:col-span-2"
          data-testid="outreach-settings-missing"
        >
          <Settings2 className="size-4 shrink-0" aria-hidden />
          <span>
            Add the {missing.join(", ")} in{" "}
            <Link href={`/w/${slug}/settings/outreach`} className="font-semibold underline">
              Settings → Outreach
            </Link>{" "}
            — no email can go out without them.
          </span>
        </p>
      )}
    </div>
  );
}
