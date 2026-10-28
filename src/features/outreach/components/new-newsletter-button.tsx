"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

import { createNewsletter } from "../server/actions";

export function NewNewsletterButton() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      size="sm"
      disabled={!hydrated || pending}
      data-testid="new-newsletter"
      onClick={() =>
        start(async () => {
          const r = await createNewsletter({ workspaceId: ws.id });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          router.push(`/w/${ws.slug}/outreach/newsletters/${r.data.id}`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      New newsletter
    </Button>
  );
}
