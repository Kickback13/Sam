"use client";

import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

import { markAlertsRead } from "../server/actions/listings";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!hydrated || pending || disabled}
      data-testid="mark-all-read"
      onClick={() =>
        start(async () => {
          const r = await markAlertsRead({ workspaceId: ws.id });
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.data.count ? `Marked ${r.data.count} read` : "Nothing unread");
          router.refresh();
        })
      }
    >
      <CheckCheck aria-hidden /> Mark all read
    </Button>
  );
}

/** Opening an alert marks it read. */
export function AlertLink({
  alertId,
  unread,
  href,
  children,
}: {
  alertId: string;
  unread: boolean;
  href: string;
  children: React.ReactNode;
}) {
  const ws = useWorkspace();
  return (
    <Link
      href={href}
      className="font-semibold break-words hover:underline"
      onClick={() => {
        if (unread) void markAlertsRead({ workspaceId: ws.id, alertIds: [alertId] });
      }}
    >
      {children}
    </Link>
  );
}
