import { Newspaper } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PostCard } from "@/features/network/components/post-card";
import { PostComposer } from "@/features/network/components/post-composer";
import { getNetworkContext, listPosts } from "@/features/network/server/queries";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({ params }: PageProps<"/n/[slug]">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const posts = await listPosts(ctx);
  const canPost = Boolean(ctx.memberId) || ctx.canModerate;
  return (
    <>
      <h1 className="sr-only">Feed</h1>
      {canPost && (
        <PostComposer
          workspaceId={ctx.workspaceId}
          allowPin={ctx.canModerate}
          postingAs={ctx.memberId ? (ctx.displayName ?? "you") : `${ctx.name} team`}
        />
      )}
      {posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Nothing here yet"
          description="Posts and deals from the community show up here."
        />
      ) : (
        <div className="space-y-3" data-testid="feed">
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
