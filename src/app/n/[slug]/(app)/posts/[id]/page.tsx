import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentForm, DeleteCommentButton } from "@/features/network/components/member-forms";
import { PostCard } from "@/features/network/components/post-card";
import { getNetworkContext, getPost } from "@/features/network/server/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: PageProps<"/n/[slug]/posts/[id]">) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getNetworkContext(slug);
  const data = await getPost(ctx, id);
  if (!data) notFound();
  const { post, comments } = data;
  return (
    <>
      <Link
        href={`/n/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Feed
      </Link>
      <PostCard
        post={post}
        slug={slug}
        workspaceId={ctx.workspaceId}
        canModerate={ctx.canModerate}
        isMine={post.authorUserId === ctx.userId}
        linkToPost={false}
      />
      <section aria-labelledby="comments-h" className="space-y-3">
        <h2 id="comments-h" className="font-sans text-base font-bold">
          Comments ({comments.length})
        </h2>
        <ul className="space-y-2" data-testid="comments">
          {comments.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg border bg-card p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {c.authorName} · {formatDateTime(c.createdAt)}
                </p>
                <p className="break-words whitespace-pre-wrap">{c.body}</p>
              </div>
              {(c.authorUserId === ctx.userId || ctx.canModerate) && (
                <DeleteCommentButton workspaceId={ctx.workspaceId} id={c.id} />
              )}
            </li>
          ))}
        </ul>
        {(ctx.memberId || ctx.canModerate) && !post.hidden && (
          <CommentForm workspaceId={ctx.workspaceId} postId={post.id} />
        )}
      </section>
    </>
  );
}
