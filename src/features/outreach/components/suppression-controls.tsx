"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { addSuppression, removeSuppression } from "../server/actions";

/** Add an email or number to the do-not-send list (any writer). */
export function AddSuppressionForm() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!ws.canWrite) return null;
  return (
    <form
      noValidate
      className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end"
      data-testid="add-suppression"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await addSuppression({
            workspaceId: ws.id,
            reason: channel === "sms" ? "stop" : "manual",
            values: { channel, value, note },
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          toast.success("Added to the do-not-send list");
          setValue("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <Field id="sup-channel" label="Type">
        <NativeSelect
          id="sup-channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "email" | "sms")}
        >
          <option value="email">Email</option>
          <option value="sms">Text (STOP)</option>
        </NativeSelect>
      </Field>
      <Field
        id="sup-value"
        label={channel === "email" ? "Email" : "Phone"}
        error={errors.value?.[0]}
      >
        <Input
          id="sup-value"
          value={value}
          inputMode={channel === "email" ? "email" : "tel"}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(errors.value)}
        />
      </Field>
      <Field id="sup-note" label="Note (optional)">
        <Input
          id="sup-note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        disabled={!hydrated || pending || !value.trim()}
        data-testid="add-suppression-submit"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Add
      </Button>
    </form>
  );
}

export function RemoveSuppressionButton({ id, value }: { id: string; value: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.isAdmin) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-brand-danger"
      disabled={pending}
      aria-label={`Remove ${value} from the do-not-send list`}
      onClick={() => {
        if (
          !confirm(
            `Remove ${value}? Only do this if they asked to hear from you again (for texts: they replied START).`,
          )
        )
          return;
        start(async () => {
          const r = await removeSuppression({ workspaceId: ws.id, id });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Removed");
          router.refresh();
        });
      }}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
