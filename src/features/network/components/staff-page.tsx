import { ExternalLink, Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/features/network/components/post-card";
import { PostComposer } from "@/features/network/components/post-composer";
import {
  CancelEventButton,
  EventForm,
  InviteForm,
  InviteRowActions,
  MemberAdminControls,
} from "@/features/network/components/staff-controls";
import { pushConfig } from "@/features/network/push";
import { memberTypeLabel } from "@/features/network/schema";
import { communityTerms, type CommunityKind } from "@/features/network/terms";
import {
  listMembersForStaff,
  listPendingInvites,
  listPosts,
  listStaffEvents,
} from "@/features/network/server/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "members", label: "Members & invites" },
  { key: "posts", label: "Posts" },
  { key: "events", label: "Events" },
] as const;

export type StaffTab = (typeof TABS)[number]["key"];

export function staffTab(raw: string | string[] | undefined): StaffTab {
  return TABS.some((t) => t.key === raw) ? (raw as StaffTab) : "members";
}

/**
 * The team side of a community: Housing4All's Network (/w/[slug]/network) and AZH's
 * Community (/w/[slug]/community) render this same page with their own words.
 */
export async function CommunityStaffPage({
  slug,
  tab,
  workspace,
  canWrite,
  userId,
  kind,
}: {
  slug: string;
  tab: StaffTab;
  workspace: { id: string; name: string };
  canWrite: boolean;
  userId: string;
  kind: CommunityKind;
}) {
  const terms = communityTerms(kind);
  const ctx = { workspaceId: workspace.id, name: workspace.name };

  return (
    <>
      <PageHeader
        title={terms.suffix}
        description={terms.staffBlurb(workspace.name)}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`/n/${slug}`} data-testid="open-member-app">
              <ExternalLink aria-hidden /> Open the member app
            </Link>
          </Button>
        }
      />
      <nav aria-label={terms.suffix} className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/w/${slug}/${terms.staffPath}?tab=${t.key}`}
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

      {tab === "members" && (
        <MembersTab workspaceId={workspace.id} slug={slug} suffix={terms.suffix} />
      )}
      {tab === "posts" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" data-testid="push-status">
            {pushConfig().connected
              ? "Push notifications: on. Members who opted in on their phone get a notification for each team post and event (not for members' posts)."
              : "Push notifications: not connected. Add the free notification keys in Vercel (see docs/ACCOUNTS.md) and members can opt in to hear about team posts and events."}
          </p>
          {canWrite && (
            <PostComposer
              workspaceId={workspace.id}
              allowPin
              postingAs={`${workspace.name} team`}
              kind={kind}
            />
          )}
          {(await listPosts(ctx, { includeHidden: true })).map((p) => (
            <PostCard
              key={p.id}
              post={p}
              slug={slug}
              workspaceId={workspace.id}
              canModerate={canWrite}
              isMine={p.authorUserId === userId}
              kind={kind}
            />
          ))}
        </div>
      )}
      {tab === "events" && <EventsTab workspaceId={workspace.id} />}
    </>
  );
}

async function MembersTab({
  workspaceId,
  slug,
  suffix,
}: {
  workspaceId: string;
  slug: string;
  suffix: string;
}) {
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
          To email members, write a newsletter in Outreach and tick “Only {suffix} members” — every
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
