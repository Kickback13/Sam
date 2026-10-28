import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PostCard } from "@/features/network/components/post-card";
import { PostComposer } from "@/features/network/components/post-composer";
import { getNetworkContext, listPosts } from "@/features/network/server/queries";

export const metadata: Metadata = { title: "Deals" };

export default async function DealsPage({ params }: PageProps<"/n/[slug]/deals">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const posts = await listPosts(ctx, { kind: "deal" });
  return (
    <>
      <h1 className="font-display text-xl font-bold">Deals</h1>
      <p className="text-sm text-muted-foreground">
        Opportunities shared by members and the team. Numbers are as posted — do your own diligence.
      </p>
      {(ctx.memberId || ctx.canModerate) && (
        <PostComposer
          workspaceId={ctx.workspaceId}
          defaultKind="deal"
          allowPin={ctx.canModerate}
          postingAs={ctx.memberId ? (ctx.displayName ?? "you") : `${ctx.name} team`}
        />
      )}
      {posts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No deals posted yet"
          description="Share one with “Share a deal”."
        />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              slug={slug}
              workspaceId={ctx.workspaceId}
              canModerate={ctx.canModerate}
              isMine={p.authorUserId === ctx.userId}
            />
          ))}
        </div>
      )}
    </>
  );
}
