import { ArrowLeft, MessagesSquare, MessageSquareOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { ContactTexts } from "@/features/outreach/components/contact-texts";
import { filterConversations, preview, type InboxFilter } from "@/features/outreach/inbox";
import { getInbox, getSmsState, smsOffReason } from "@/features/outreach/server/sms-queries";
import { formatPhone } from "@/lib/normalize";
import { formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Messages" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function MessagesPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/messages">) {
  const { slug } = await params;
  const sp = await searchParams;
  const filter: InboxFilter = one(sp.f) === "needs_reply" ? "needs_reply" : "all";
  const selected = UUID.test(one(sp.c) ?? "") ? one(sp.c)! : null;
  const { workspace, isAdmin } = await getWorkspaceContext(slug);
  const [inbox, sms] = await Promise.all([getInbox(workspace.id), getSmsState(workspace.id)]);
  const off = smsOffReason(sms);
  const list = filterConversations(inbox, filter);
  const waiting = inbox.filter((c) => c.needsReply).length;

  let contact = null;
  if (selected) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, dnc, sms_consent, sms_consent_at, email_opt_out, emails, phones")
      .eq("workspace_id", workspace.id)
      .eq("id", selected)
      .is("deleted_at", null)
      .maybeSingle();
    contact = data;
  }
  const href = (q: { f?: InboxFilter; c?: string | null }) => {
    const p = new URLSearchParams();
    const f = q.f ?? filter;
    if (f !== "all") p.set("f", f);
    if (q.c) p.set("c", q.c);
    const s = p.toString();
    return `/w/${slug}/messages${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every text conversation in one place, newest first. A person writes and sends every text; each one passes the same consent, STOP, do-not-contact and texting-hours checks as on the contact page."
      />
      {off && (
        <p
          className="mb-4 flex items-start gap-1.5 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
          data-testid="inbox-off"
        >
          <MessageSquareOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{off}</span> Replies only arrive, and texts only go out,
            once texting is set up and switched on
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
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section
          className={cn("space-y-3", selected && "hidden lg:block")}
          aria-label="Conversations"
        >
          <nav className="flex gap-1" aria-label="Filter">
            {(
              [
                ["all", `All ${inbox.length}`],
                ["needs_reply", `Needs reply ${waiting}`],
              ] as const
            ).map(([f, label]) => (
              <Link
                key={f}
                href={href({ f, c: selected })}
                aria-current={filter === f ? "page" : undefined}
                data-testid={`inbox-filter-${f}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  filter === f
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          {list.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={filter === "needs_reply" ? "Nothing waiting for a reply" : "No texts yet"}
              description={
                filter === "needs_reply"
                  ? "Every conversation has been answered."
                  : "Conversations appear here when you text a contact or someone texts your number."
              }
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-card" data-testid="inbox-list">
              {list.map((c) => (
                <li key={c.contactId}>
                  <Link
                    href={href({ c: c.contactId })}
                    aria-current={selected === c.contactId ? "true" : undefined}
                    data-testid="inbox-row"
                    data-needs-reply={c.needsReply}
                    className={cn(
                      "block px-3 py-2.5 hover:bg-muted",
                      selected === c.contactId && "bg-muted",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(c.last.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        {preview(c.last)}
                      </span>
                      {c.needsReply && (
                        <Badge variant="warning" className="shrink-0">
                          {c.unanswered > 1 ? `${c.unanswered} new` : "Reply"}
                        </Badge>
                      )}
                    </span>
                    {c.phone && (
                      <span className="text-xs text-muted-foreground tabular">
                        {formatPhone(c.phone)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className={cn("space-y-3", !selected && "hidden lg:block")}
          aria-label="Conversation"
        >
          {selected && contact ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={href({ c: null })}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-4" aria-hidden /> All conversations
                </Link>
                <Link
                  href={`/w/${slug}/people/${contact.id}`}
                  className="font-semibold text-brand-accent-text hover:underline"
                  data-testid="inbox-contact-link"
                >
                  {contact.full_name || "Contact"} →
                </Link>
              </div>
              <ContactTexts
                workspaceId={workspace.id}
                slug={slug}
                isAdmin={isAdmin}
                contact={contact}
              />
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {selected
                ? "That contact isn't available."
                : "Pick a conversation to read and reply."}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
