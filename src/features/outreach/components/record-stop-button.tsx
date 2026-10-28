"use client";

import { MessageSquareOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";

import { addSuppression } from "../server/actions";

/** Record a STOP that arrived outside the platform (e.g. a reply to Sam's phone). */
export function RecordStopButton({
  contactId,
  phone,
  label,
}: {
  contactId: string;
  phone: string;
  label: string;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="record-stop"
      onClick={() => {
        if (!confirm(`Record that ${label} texted STOP? No texts will go to this number again.`))
          return;
        start(async () => {
          const r = await addSuppression({
            workspaceId: ws.id,
            reason: "stop",
            contactId,
            values: { channel: "sms", value: phone, note: "Recorded from the contact page" },
          });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(`${label} added to the do-not-send list`);
          router.refresh();
        });
      }}
    >
      <MessageSquareOff aria-hidden /> {label} texted STOP
    </Button>
  );
}
