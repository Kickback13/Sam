import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PostCard } from "@/features/network/components/post-card";
import { PostComposer } from "@/features/network/components/post-composer";
import { getNetworkContext, listPosts } from "@/features/network/server/queries";
import { communityTerms } from "@/features/network/terms";

export async function generateMetadata({
  params,
}: PageProps<"/n/[slug]/deals">): Promise<Metadata> {
  const { slug } = await params;
  return { title: communityTerms((await getNetworkContext(slug)).kind).dealsLabel };
}

export default async function DealsPage({ params }: PageProps<"/n/[slug]/deals">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const posts = await listPosts(ctx, { kind: "deal" });
  const terms = communityTerms(ctx.kind);
  return (
    <>
      <h1 className="font-display text-xl font-bold">{terms.dealsLabel}</h1>
      <p className="text-sm text-muted-foreground">
        {ctx.kind === "construction"
          ? "Projects shared by members and the team. Details are as posted — check before you bid or hire."
          : "Opportunities shared by members and the team. Numbers are as posted — do your own diligence."}
      </p>
      {(ctx.memberId || ctx.canModerate) && (
        <PostComposer
          workspaceId={ctx.workspaceId}
          defaultKind="deal"
          allowPin={ctx.canModerate}
          postingAs={ctx.memberId ? (ctx.displayName ?? "you") : `${ctx.name} team`}
          kind={ctx.kind}
        />
      )}
      {posts.length === 0 ? (
        <EmptyState icon={Building2} title={terms.noDeals} description={terms.shareHint} />
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
              kind={ctx.kind}
            />
          ))}
        </div>
      )}
    </>
  );
}
