"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";

import { sendSms } from "../server/sms";
import { smsSegments } from "../sms-segments";

/** Write and send one text. Disabled (with the reason) whenever a gate or the switch says no. */
export function SmsComposer({
  contactId,
  disabledReason,
}: {
  contactId: string;
  disabledReason: string | null;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const segments = smsSegments(body.trim());
  const disabled = Boolean(disabledReason) || !ws.canWrite;
  return (
    <form
      className="space-y-2"
      data-testid="sms-composer"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await sendSms({ workspaceId: ws.id, contactId, body });
          if (!r.ok) {
            setError(r.error);
            router.refresh();
            return;
          }
          toast.success("Text sent");
          setBody("");
          router.refresh();
        });
      }}
    >
      <Label htmlFor={`sms-body-${contactId}`} className="sr-only">
        Text message
      </Label>
      <Textarea
        id={`sms-body-${contactId}`}
        rows={2}
        maxLength={1600}
        value={body}
        disabled={disabled}
        placeholder={
          disabled ? "Texting isn't available for this contact right now" : "Write a text…"
        }
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular">
          {body.length}/1600 · {segments} {segments === 1 ? "segment" : "segments"}
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={!hydrated || disabled || pending || !body.trim()}
          data-testid="sms-send"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send
          text
        </Button>
      </div>
      {error && (
        <p role="status" className="text-sm font-medium text-brand-danger" data-testid="sms-error">
          {error}
        </p>
      )}
    </form>
  );
}
