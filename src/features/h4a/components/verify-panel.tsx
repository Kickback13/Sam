"use client";

import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { VERIFICATION_SOURCES } from "../constants";
import { verifyListing } from "../server/actions/listings";

/** "Mark verified" / "Mark mismatch" with a required note and source (saved with user + date). */
export function VerifyButtons({ listingId, status }: { listingId: string; status: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"verified" | "mismatch" | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<string>(VERIFICATION_SOURCES[0]);
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!ws.canWrite) return null;

  const open = (m: "verified" | "mismatch") => {
    setMode(m);
    setErrors({});
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!hydrated}
        onClick={() => open("verified")}
        data-testid="mark-verified"
      >
        <ShieldCheck aria-hidden /> Mark verified
      </Button>
      <Button size="sm" variant="outline" disabled={!hydrated} onClick={() => open("mismatch")}>
        <ShieldAlert aria-hidden /> Mark mismatch
      </Button>
      {status !== "unverified" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={!hydrated || pending}
          onClick={() =>
            start(async () => {
              const r = await verifyListing({
                workspaceId: ws.id,
                listingId,
                status: "unverified",
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Verification cleared");
              router.refresh();
            })
          }
        >
          Clear
        </Button>
      )}
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "mismatch" ? "Mark mismatch" : "Mark verified"}</DialogTitle>
            <DialogDescription>
              Say what you checked and where. It&apos;s saved with your name and today&apos;s date.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await verifyListing({
                  workspaceId: ws.id,
                  listingId,
                  status: mode!,
                  note,
                  source,
                });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? { note: [r.error] });
                  return;
                }
                setMode(null);
                setNote("");
                toast.success(mode === "mismatch" ? "Marked mismatch" : "Marked verified");
                router.refresh();
              });
            }}
          >
            <Field
              id="verify-note"
              label={mode === "mismatch" ? "What doesn't match" : "What you checked"}
              required
              error={errors.note?.[0]}
            >
              <Textarea
                id="verify-note"
                rows={3}
                maxLength={2000}
                placeholder={
                  mode === "mismatch"
                    ? "e.g. County shows 22 units; the listing says 24"
                    : "e.g. Owner, APN, units and year built match"
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={Boolean(errors.note)}
              />
            </Field>
            <Field id="verify-source" label="Where you checked" required error={errors.source?.[0]}>
              <Input
                id="verify-source"
                list="verify-source-options"
                maxLength={300}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                aria-invalid={Boolean(errors.source)}
              />
              <datalist id="verify-source-options">
                {VERIFICATION_SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} data-testid="confirm-verify">
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
