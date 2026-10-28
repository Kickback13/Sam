"use client";

import { Eye, EyeOff, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deletePost, moderatePost } from "../server/actions";

export function PostActions({
  workspaceId,
  postId,
  canModerate,
  isMine,
  hidden,
  pinned,
}: {
  workspaceId: string;
  postId: string;
  canModerate: boolean;
  isMine: boolean;
  hidden: boolean;
  pinned: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canModerate && !isMine) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label="Post options"
          data-testid="post-options"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canModerate && (
          <>
            <DropdownMenuItem
              onSelect={() =>
                run(
                  () => moderatePost({ workspaceId, id: postId, pinned: !pinned }),
                  pinned ? "Unpinned" : "Pinned",
                )
              }
            >
              {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}{" "}
              {pinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="post-hide"
              onSelect={() =>
                run(
                  () => moderatePost({ workspaceId, id: postId, hidden: !hidden }),
                  hidden ? "Visible to members again" : "Hidden from members",
                )
              }
            >
              {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}{" "}
              {hidden ? "Show to members" : "Hide from members"}
            </DropdownMenuItem>
          </>
        )}
        {(isMine || canModerate) && (
          <DropdownMenuItem
            className="text-brand-danger"
            onSelect={() => {
              if (confirm("Delete this post and its comments?"))
                run(() => deletePost({ workspaceId, id: postId }), "Post deleted");
            }}
          >
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
