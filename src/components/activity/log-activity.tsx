"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { CALL_OUTCOMES, type SubjectType } from "@/lib/validation/activity";
import { logActivity } from "@/server/actions/activities";

type Kind = "note" | "call" | "meeting";

export function LogActivity({
  subjectType,
  subjectId,
}: {
  subjectType: SubjectType;
  subjectId: string;
}) {
  const ws = useWorkspace();
  const hydrated = useHydrated();
  const [kind, setKind] = useState<Kind>("note");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [duration, setDuration] = useState("");
  const [pending, start] = useTransition();

  if (!ws.canWrite) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await logActivity({
        workspaceId: ws.id,
        type: kind,
        subject_type: subjectType,
        subject_id: subjectId,
        body,
        outcome: kind === "call" ? outcome : null,
        duration_minutes: kind === "note" ? null : duration,
      });
      if (!result.ok) {
        toast.error(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      toast.success(
        kind === "note" ? "Note added" : kind === "call" ? "Call logged" : "Meeting logged",
      );
      setBody("");
      setDuration("");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border bg-background p-3"
      data-testid="log-activity"
    >
      <div role="tablist" aria-label="Activity type" className="flex gap-1">
        {(["note", "call", "meeting"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent",
              kind === k && "bg-brand-ink text-white hover:bg-brand-ink",
            )}
          >
            {k === "note" ? "Add note" : k === "call" ? "Log call" : "Log meeting"}
          </button>
        ))}
      </div>
      <Label htmlFor={`activity-body-${subjectId}`} className="sr-only">
        {kind === "note" ? "Note" : "Summary"}
      </Label>
      <Textarea
        id={`activity-body-${subjectId}`}
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === "note"
            ? "Write a note…"
            : kind === "call"
              ? "What was discussed?"
              : "Meeting notes…"
        }
      />
      {kind !== "note" && (
        <div className="grid grid-cols-2 gap-3">
          {kind === "call" && (
            <div className="space-y-1.5">
              <Label htmlFor={`call-outcome-${subjectId}`}>Outcome</Label>
              <NativeSelect
                id={`call-outcome-${subjectId}`}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {CALL_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`duration-${subjectId}`}>Minutes</Label>
            <Input
              id={`duration-${subjectId}`}
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={!hydrated || pending || (kind === "note" && !body.trim())}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {kind === "note" ? "Save note" : kind === "call" ? "Log call" : "Log meeting"}
        </Button>
      </div>
    </form>
  );
}
