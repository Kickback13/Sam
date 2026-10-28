import { ExternalLink, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { PostCard } from "@/features/network/components/post-card";
import { PostComposer } from "@/features/network/components/post-composer";
import {
  CancelEventButton,
  EventForm,
  InviteForm,
  InviteRowActions,
  MemberAdminControls,
} from "@/features/network/components/staff-controls";
import { memberTypeLabel } from "@/features/network/schema";
import {
  listMembersForStaff,
  listPendingInvites,
  listPosts,
  listStaffEvents,
} from "@/features/network/server/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Network" };

const TABS = [
  { key: "members", label: "Members & invites" },
  { key: "posts", label: "Posts" },
  { key: "events", label: "Events" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function NetworkAdminPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/network">) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "members";
  const { workspace, canWrite, user } = await getRealEstateContext(slug);
  const ctx = { workspaceId: workspace.id, name: workspace.name };

  return (
    <>
      <PageHeader
        title="Network"
        description={`The ${workspace.name} Network: an invite-only app for investors and partners. Members see posts, deals, events and each other — never your CRM. Each member is linked to a contact here.`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/n/${slug}`} data-testid="open-member-app">
              <ExternalLink aria-hidden /> Open the member app
            </Link>
          </Button>
        }
      />
      <nav aria-label="Network" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/w/${slug}/network?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
              tab === t.key ? "border-brand-ink text-foreground" : "border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "members" && <MembersTab workspaceId={workspace.id} slug={slug} />}
      {tab === "posts" && (
        <div className="space-y-3">
          {canWrite && (
            <PostComposer
              workspaceId={workspace.id}
              allowPin
              postingAs={`${workspace.name} team`}
            />
          )}
          {(await listPosts(ctx, { includeHidden: true })).map((p) => (
            <PostCard
              key={p.id}
              post={p}
              slug={slug}
              workspaceId={workspace.id}
              canModerate={canWrite}
              isMine={p.authorUserId === user.id}
            />
          ))}
        </div>
      )}
      {tab === "events" && <EventsTab workspaceId={workspace.id} />}
    </>
  );
}

async function MembersTab({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const [members, invites] = await Promise.all([
    listMembersForStaff(workspaceId),
    listPendingInvites(workspaceId),
  ]);
  const active = members.filter((m) => m.status === "active").length;
  return (
    <div className="space-y-4">
      <InviteForm />
      {invites.length > 0 && (
        <section className="rounded-xl border bg-card p-4" aria-labelledby="inv-h">
          <h2 id="inv-h" className="mb-2 font-sans text-base font-bold">
            Waiting to join ({invites.length})
          </h2>
          <ul className="divide-y text-sm" data-testid="pending-invites">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{i.name || i.email || "Open invite"}</span>{" "}
                  <span className="text-muted-foreground">
                    {i.email && i.name ? `${i.email} · ` : ""}
                    {memberTypeLabel(i.memberType)} · expires {formatDate(i.expiresAt)}
                  </span>
                </span>
                <InviteRowActions id={i.id} token={i.token} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="mem-h" className="space-y-2">
        <h2 id="mem-h" className="font-sans text-base font-bold">
          Members ({active} active)
        </h2>
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Create an invite link above and send it."
          />
        ) : (
          <ul className="space-y-2" data-testid="network-members">
            {members.map((m) => (
              <li
                key={m.id}
                className="space-y-2 rounded-xl border bg-card p-4"
                data-testid="network-member"
                data-name={m.displayName}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {m.displayName}{" "}
                      {m.status === "removed" && <Badge variant="danger">Removed</Badge>}
                      {!m.showInDirectory && m.status === "active" && (
                        <Badge variant="secondary">Unlisted</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {memberTypeLabel(m.memberType)} · joined {formatDateTime(m.joinedAt)}
                      {m.headline ? ` · ${m.headline}` : ""}
                    </p>
                  </div>
                  {m.contactId && (
                    <Link
                      href={`/w/${slug}/people/${m.contactId}`}
                      className="text-sm font-semibold underline"
                    >
                      CRM contact
                    </Link>
                  )}
                </div>
                <MemberAdminControls
                  id={m.id}
                  memberType={m.memberType}
                  tags={m.tags}
                  status={m.status}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          To email members, write a newsletter in Outreach and tick “Only Network members” — every
          send still passes the opt-out and DNC checks.
        </p>
      </section>
    </div>
  );
}

async function EventsTab({ workspaceId }: { workspaceId: string }) {
  const events = await listStaffEvents(workspaceId);
  return (
    <div className="space-y-4">
      <EventForm />
      <ul className="divide-y rounded-xl border bg-card text-sm" data-testid="staff-events">
        {events.length === 0 && <li className="p-4 text-muted-foreground">No events yet.</li>}
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span>
              <span className="font-medium">{e.title}</span>{" "}
              <span className="text-muted-foreground">
                {formatDateTime(e.startsAt)}
                {e.location ? ` · ${e.location}` : ""} · {e.going} going
              </span>{" "}
              {e.canceled && <Badge variant="danger">Canceled</Badge>}
            </span>
            {!e.canceled && <CancelEventButton id={e.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
