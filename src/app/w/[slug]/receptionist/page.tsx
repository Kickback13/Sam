import { Phone, PhoneCall, PhoneMissed, PlugZap, Voicemail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { NewRoute } from "@/features/receptionist/components/new-route";
import {
  ConnectionLinks,
  RouteForm,
  RoutingTester,
  SettingsForm,
} from "@/features/receptionist/components/setup-forms";
import { receptionistConfig } from "@/features/receptionist/config";
import {
  getSettings,
  hasActiveToken,
  listCalls,
  listRoutes,
  type CallRow,
} from "@/features/receptionist/server/queries";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Receptionist" };

const OUTCOME: Record<
  CallRow["outcome"],
  { label: string; variant: "success" | "info" | "warning" | "danger" | "secondary" }
> = {
  answered: { label: "Answered", variant: "success" },
  answered_by_ai: { label: "AI answered", variant: "info" },
  voicemail: { label: "Voicemail", variant: "warning" },
  missed: { label: "Missed", variant: "danger" },
  in_progress: { label: "In progress", variant: "secondary" },
};

const duration = (s: number | null) =>
  s === null ? null : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

export default async function ReceptionistPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/receptionist">) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "setup" ? "setup" : "calls";
  const { workspace, isAdmin } = await getRealEstateContext(slug);
  const cfg = receptionistConfig();

  return (
    <>
      <PageHeader
        title="Receptionist"
        description="Calls to your business number: a person is rung first; if nobody picks up (or it's after hours) the AI receptionist answers in English or Spanish. Every call lands on the caller's contact with a follow-up task for the right person."
      />
      <nav aria-label="Receptionist" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {[
          ["calls", "Calls"],
          ["setup", "Setup"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/w/${slug}/receptionist${key === "setup" ? "?tab=setup" : ""}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
              tab === key ? "border-brand-ink text-foreground" : "border-transparent",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="receptionist-status">
        {[
          [
            "Phone number (Twilio)",
            cfg.twilio.connected,
            "Sam's Twilio number forwards calls here.",
          ],
          [
            "AI voice (ElevenLabs)",
            cfg.elevenlabs.connected,
            "Transcripts and summaries come back after each call.",
          ],
          [
            "AI answers calls",
            Boolean(cfg.aiSipUri),
            "Without it, unanswered calls go to voicemail.",
          ],
        ].map(([label, on, help]) => (
          <div key={label as string} className="rounded-xl border bg-card p-3 text-sm">
            <p className="flex items-center justify-between gap-2 font-semibold">
              <span className="flex items-center gap-1.5">
                <PlugZap className="size-4 text-muted-foreground" aria-hidden /> {label as string}
              </span>
              <Badge variant={on ? "success" : "secondary"}>
                {on ? "Connected" : "Not connected"}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{help as string}</p>
          </div>
        ))}
      </div>

      {tab === "calls" ? (
        <CallsTab workspaceId={workspace.id} slug={slug} />
      ) : (
        <SetupTab workspaceId={workspace.id} isAdmin={isAdmin} />
      )}
    </>
  );
}

async function CallsTab({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const calls = await listCalls(workspaceId);
  if (calls.length === 0)
    return (
      <EmptyState
        icon={PhoneCall}
        title="No calls yet"
        description="Once Sam's Twilio number points here (Setup → Connection links), every call shows up with its outcome, summary and transcript."
      />
    );
  return (
    <ul className="space-y-2" data-testid="calls">
      {calls.map((c) => {
        const o = OUTCOME[c.outcome];
        const Icon =
          c.outcome === "missed" ? PhoneMissed : c.outcome === "voicemail" ? Voicemail : Phone;
        return (
          <li
            key={c.id}
            className="space-y-2 rounded-xl border bg-card p-4"
            data-testid="call"
            data-outcome={c.outcome}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {c.contactId ? (
                    <Link href={`/w/${slug}/people/${c.contactId}`} className="hover:underline">
                      {c.contactName ?? c.callerName ?? formatPhone(c.fromNumber)}
                    </Link>
                  ) : (
                    (c.callerName ?? formatPhone(c.fromNumber)) || "Unknown caller"
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatPhone(c.fromNumber)} · {formatDateTime(c.startedAt)}
                  {duration(c.durationSecs) ? ` · ${duration(c.durationSecs)}` : ""}
                  {c.language === "es" ? " · Spanish" : ""}
                  {c.routeName ? ` · ${c.routeName}` : ""}
                </p>
              </div>
              <Badge variant={o.variant}>{o.label}</Badge>
            </div>
            {c.summary && (
              <p className="text-sm">
                {c.summary}
                {c.summarySource && (
                  <span className="block text-xs text-muted-foreground">
                    Summary by {c.summarySource}
                  </span>
                )}
              </p>
            )}
            {c.voicemailUrl && (
              <a
                href={c.voicemailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold underline"
              >
                Voicemail recording (opens in Twilio)
              </a>
            )}
            {c.transcript.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Transcript ({c.transcript.length} lines)
                </summary>
                <ol className="mt-2 space-y-1">
                  {c.transcript.map((t, i) => (
                    <li key={i}>
                      <span className="font-semibold">
                        {t.role === "agent" ? "Receptionist" : "Caller"}:
                      </span>{" "}
                      {t.text}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {c.taskId && <p className="text-xs text-muted-foreground">Follow-up task created.</p>}
          </li>
        );
      })}
    </ul>
  );
}

async function SetupTab({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const [settings, routes, token] = await Promise.all([
    getSettings(workspaceId),
    listRoutes(workspaceId),
    hasActiveToken(workspaceId),
  ]);
  return (
    <div className="space-y-4">
      {!isAdmin && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Only owners and admins can change the receptionist.
        </p>
      )}
      <ConnectionLinks hasToken={token} />
      <SettingsForm
        initial={{
          enabled: settings.enabled,
          ringSeconds: settings.ringSeconds,
          timeZone: settings.timeZone,
          hours: settings.hours,
          greetingEn: settings.greetingEn ?? "",
          greetingEs: settings.greetingEs ?? "",
        }}
      />
      <section className="space-y-3" aria-labelledby="routes-h" data-testid="routes">
        <h2 id="routes-h" className="font-sans text-base font-bold">
          Routes
        </h2>
        <p className="text-sm text-muted-foreground">
          Who handles what. The default route is rung first; after a call the AI&apos;s transcript
          picks the route by keywords, and that route&apos;s person gets the follow-up task.
        </p>
        {isAdmin
          ? routes.map((r) => (
              <RouteForm
                key={r.id}
                initial={{
                  id: r.id,
                  name: r.name,
                  description: r.description ?? "",
                  forward_to: r.forward_to ?? "",
                  keywords: r.keywords.join(", "),
                  languages: r.languages as ("en" | "es")[],
                  assignee_user_id: r.assigneeUserId ?? "",
                  is_default: r.is_default,
                  active: r.active,
                  position: r.position,
                }}
              />
            ))
          : routes.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-3 text-sm">
                <p className="font-semibold">
                  {r.name} {r.is_default && <Badge variant="secondary">Default</Badge>}
                </p>
                <p className="text-muted-foreground">
                  {r.forward_to ? formatPhone(r.forward_to) : "AI takes a message"} ·{" "}
                  {r.keywords.join(", ") || "no keywords"}
                </p>
              </div>
            ))}
        <NewRoute count={routes.length} />
      </section>
      <RoutingTester
        routes={routes.filter((r) => r.active)}
        hours={settings.hours}
        timeZone={settings.timeZone}
      />
    </div>
  );
}
