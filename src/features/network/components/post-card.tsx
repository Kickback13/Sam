import { Building2, EyeOff, MessageSquare, Pin } from "lucide-react";
import Link from "next/link";

import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";

import type { FeedPost } from "../server/queries";
import { PostActions } from "./post-actions";

/** One feed item. Deal numbers are shown as the poster's own claim, with who and when. */
export function PostCard({
  post,
  slug,
  workspaceId,
  canModerate,
  isMine,
  linkToPost = true,
  manageHref,
}: {
  post: FeedPost;
  slug: string;
  workspaceId: string;
  canModerate: boolean;
  isMine: boolean;
  linkToPost?: boolean;
  manageHref?: string;
}) {
  const href = manageHref ?? `/n/${slug}/posts/${post.id}`;
  const facts = [
    post.propertyType,
    post.units ? `${formatNumber(post.units)} units` : null,
    post.price ? formatCurrency(post.price) : null,
    post.units && post.price ? `${formatCurrency(Math.round(post.price / post.units))}/unit` : null,
    [post.city, post.zip].filter(Boolean).join(" ") || null,
  ].filter(Boolean);

  return (
    <article
      className="space-y-2 rounded-xl border bg-card p-4"
      data-testid="network-post"
      data-kind={post.kind}
      data-title={post.title}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {post.pinned && (
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Pin className="size-3" aria-hidden /> Pinned ·
              </span>
            )}
            {post.kind === "deal" && (
              <span className="inline-flex items-center gap-1 rounded bg-brand-accent px-1.5 py-0.5 font-semibold text-black">
                <Building2 className="size-3" aria-hidden /> Deal
              </span>
            )}
            {post.hidden && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-semibold">
                <EyeOff className="size-3" aria-hidden /> Hidden from members
              </span>
            )}
            <span>
              {post.authorName} · {formatDateTime(post.createdAt)}
            </span>
          </p>
          <h2 className="mt-1 font-sans text-base font-bold break-words">
            {linkToPost ? (
              <Link href={href} className="hover:underline">
                {post.title}
              </Link>
            ) : (
              post.title
            )}
          </h2>
        </div>
        <PostActions
          workspaceId={workspaceId}
          postId={post.id}
          canModerate={canModerate}
          isMine={isMine}
          hidden={post.hidden}
          pinned={post.pinned}
        />
      </header>
      {facts.length > 0 && (
        <p className="text-sm font-semibold tabular" data-testid="deal-facts">
          {facts.join(" · ")}
          <span className="block text-xs font-normal text-muted-foreground">
            As posted by {post.authorName} · not independently verified
          </span>
        </p>
      )}
      {post.body && <p className="text-sm break-words whitespace-pre-wrap">{post.body}</p>}
      {post.link && (
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold break-all underline"
        >
          {post.link}
        </a>
      )}
      {linkToPost && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="size-3.5" aria-hidden /> {post.commentCount}{" "}
          {post.commentCount === 1 ? "comment" : "comments"}
        </Link>
      )}
    </article>
  );
}
