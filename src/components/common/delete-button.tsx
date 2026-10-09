"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validation/common";

export function DeleteButton({
  label,
  confirmText,
  action,
  redirectTo,
}: {
  label: string;
  confirmText: string;
  action: () => Promise<ActionResult>;
  redirectTo: string;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-brand-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        start(async () => {
          const result = await action();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${label} deleted`);
          router.push(redirectTo);
        });
      }}
    >
      <Trash2 aria-hidden /> Delete
    </Button>
  );
}
