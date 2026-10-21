"use client";

import {
  ArrowRightCircle,
  CheckCheck,
  CircleSlash,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";

import { DISMISS_REASONS } from "../constants";
import { promoteListing, setListingStatus } from "../server/actions/listings";

export function ListingActions({ listingId, status }: { listingId: string; status: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(DISMISS_REASONS[0]);
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  if (!ws.canWrite) return null;
  const base = `/w/${ws.slug}`;

  const run = (fn: () => Promise<void>) => start(fn);

  const changeStatus = (action: "restore" | "mark_reviewed", done: string) =>
    run(async () => {
      const r = await setListingStatus({ workspaceId: ws.id, listingId, action });
      if (!r.ok) return void toast.error(r.error);
      toast.success(done);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="listing-actions">
      {status !== "promoted" && status !== "dismissed" && (
        <Button
          size="sm"
          disabled={!hydrated || pending}
          data-testid="promote-listing"
          onClick={() =>
            run(async () => {
              const r = await promoteListing({ workspaceId: ws.id, listingId });
              if (!r.ok) return void toast.error(r.error);
              toast.success(
                r.data.propertyCreated
                  ? "Promoted: new deal in New Deal and a new property"
                  : "Promoted: new deal in New Deal, linked to the existing property",
              );
              router.refresh();
            })
          }
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ArrowRightCircle aria-hidden />
          )}
          Promote to deal
        </Button>
      )}
      {status === "needs_review" && (
        <Button
          size="sm"
          variant="outline"
          disabled={!hydrated || pending}
          data-testid="mark-reviewed"
          onClick={() => changeStatus("mark_reviewed", "Marked reviewed")}
        >
          <CheckCheck aria-hidden /> Mark reviewed
        </Button>
      )}
      {status === "dismissed" && (
        <Button
          size="sm"
          variant="outline"
          disabled={!hydrated || pending}
          onClick={() => changeStatus("restore", "Restored to the inbox")}
        >
          <RotateCcw aria-hidden /> Restore
        </Button>
      )}
      {status !== "promoted" && (
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/deal-finder/${listingId}/edit`}>
            <Pencil aria-hidden /> Correct values
          </Link>
        </Button>
      )}
      {status !== "promoted" && status !== "dismissed" && (
        <Button
          size="sm"
          variant="ghost"
          className="text-brand-danger"
          disabled={!hydrated || pending}
          data-testid="dismiss-listing"
          onClick={() => setDismissOpen(true)}
        >
          <CircleSlash aria-hidden /> Dismiss
        </Button>
      )}

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this listing</DialogTitle>
            <DialogDescription>
              It leaves the inbox but stays on file. A repeat alert updates it without bringing back
              a duplicate.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = reasonChoice === "other" ? reasonText.trim() : reasonChoice;
              if (!reason) return setReasonError("Add a reason");
              run(async () => {
                const r = await setListingStatus({
                  workspaceId: ws.id,
                  listingId,
                  action: "dismiss",
                  reason,
                });
                if (!r.ok) return setReasonError(r.error);
                setDismissOpen(false);
                toast.success("Listing dismissed");
                router.refresh();
              });
            }}
          >
            <Field id="dismiss-reason" label="Reason" required error={reasonError ?? undefined}>
              <NativeSelect
                id="dismiss-reason"
                value={reasonChoice}
                onChange={(e) => {
                  setReasonChoice(e.target.value);
                  setReasonError(null);
                }}
              >
                {DISMISS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="other">Other…</option>
              </NativeSelect>
            </Field>
            {reasonChoice === "other" && (
              <Field id="dismiss-other" label="Your reason">
                <Textarea
                  id="dismiss-other"
                  rows={2}
                  maxLength={500}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
              </Field>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDismissOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending}
                data-testid="confirm-dismiss"
              >
                Dismiss
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
