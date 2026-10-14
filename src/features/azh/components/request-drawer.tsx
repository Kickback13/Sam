"use client";

import { ArrowRight, Loader2, Mail, MapPin, Phone, PhoneCall } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import type { ActivityItem } from "@/server/queries/activity";

import { OFFICES, officeLabel, REQUEST_STATUSES } from "../constants";
import { convertRequest, logRequestCall, updateRequest } from "../server/actions/requests";
import type { RequestListItem } from "../server/queries";

export const REQUEST_STATUS_BADGE: Record<
  string,
  "info" | "warning" | "success" | "secondary" | "demo"
> = {
  new: "info",
  contacted: "warning",
  estimate_scheduled: "demo",
  converted: "success",
  closed: "secondary",
};

const TIME_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  any: "Any time",
};

export function RequestDrawer({
  request,
  photoUrls,
  activity,
  extra,
}: {
  request: RequestListItem | null;
  photoUrls: Record<string, string>;
  activity: ActivityItem[];
  /** Extra sections rendered by the server (files, visits). */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("request");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return (
    <Sheet open={Boolean(request)} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full max-w-xl" data-testid="request-drawer">
        {request && (
          <RequestBody
            key={request.id}
            r={request}
            photoUrls={photoUrls}
            activity={activity}
            extra={extra}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RequestBody({
  r,
  photoUrls,
  activity,
  extra,
}: {
  r: RequestListItem;
  photoUrls: Record<string, string>;
  activity: ActivityItem[];
  extra?: React.ReactNode;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [callNote, setCallNote] = useState("");
  const [outcome, setOutcome] = useState<"reached" | "voicemail" | "no_answer">("reached");

  function patch(
    p: { status?: string; office?: string; assigned_to?: string | null },
    msg: string,
  ) {
    startBusy(async () => {
      const result = await updateRequest({ workspaceId: ws.id, requestId: r.id, patch: p });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(msg);
      router.refresh();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{r.contact?.name ?? "Homeowner request"}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <Badge variant={REQUEST_STATUS_BADGE[r.status]}>
            {REQUEST_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
          </Badge>
          <span>{r.serviceType ?? "—"}</span>
          <span>· {officeLabel(r.office)} office</span>
          <span>· {formatDateTime(r.submittedAt)}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <section aria-label="Contact" className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {r.contact?.phone && (
              <Button asChild size="sm" variant="dark">
                <a href={`tel:${r.contact.phone}`}>
                  <Phone aria-hidden /> {formatPhone(r.contact.phone)}
                </a>
              </Button>
            )}
            {r.contact?.email && (
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${r.contact.email}`}>
                  <Mail aria-hidden /> Email
                </a>
              </Button>
            )}
            {r.contact && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/w/${ws.slug}/people/${r.contact.id}`}>Contact record</Link>
              </Button>
            )}
          </div>
          {r.jobAddress && (
            <p className="flex items-start gap-1">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {r.jobAddress} {r.jobZip}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Best time to call:</span>{" "}
            {TIME_LABEL[r.preferredContactTime ?? "any"]} ·{" "}
            <span className="text-muted-foreground">Language:</span>{" "}
            {r.language === "es" ? "Spanish" : "English"}
          </p>
          <p data-testid="request-consent">
            <span className="text-muted-foreground">SMS consent:</span>{" "}
            {r.smsConsent ? (
              <>
                Yes, {formatDateTime(r.smsConsentAt)} (web form)
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Wording they agreed to</summary>
                  <p className="mt-1 whitespace-pre-wrap">{r.smsConsentText}</p>
                </details>
              </>
            ) : (
              "No — call or email only"
            )}
          </p>
          {r.description && (
            <p className="rounded-md bg-muted px-3 py-2 whitespace-pre-wrap">{r.description}</p>
          )}
        </section>

        {r.photoPaths.length > 0 && (
          <section aria-label="Photos">
            <h3 className="mb-2 text-sm font-bold">Photos ({r.photoPaths.length})</h3>
            <ul className="grid grid-cols-3 gap-2" data-testid="request-photos">
              {r.photoPaths.map((p, i) =>
                photoUrls[p] ? (
                  <li key={p}>
                    <a
                      href={photoUrls[p]}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-md border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img
                        src={photoUrls[p]}
                        alt={`Request photo ${i + 1}`}
                        className="size-full object-cover"
                      />
                    </a>
                  </li>
                ) : (
                  <li
                    key={p}
                    className="flex aspect-square items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
                  >
                    Unavailable
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        {ws.canWrite && (
          <section aria-label="Manage" className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="req-status">Status</Label>
              <NativeSelect
                id="req-status"
                value={r.status}
                disabled={busy}
                onChange={(e) => patch({ status: e.target.value }, "Status updated")}
              >
                {REQUEST_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-assignee">Assigned to</Label>
              <NativeSelect
                id="req-assignee"
                value={r.assignedTo ?? ""}
                disabled={busy}
                onChange={(e) =>
                  patch({ assigned_to: e.target.value || null }, "Assignment updated")
                }
              >
                <option value="">Unassigned</option>
                {ws.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-office">Office</Label>
              <NativeSelect
                id="req-office"
                value={r.office}
                disabled={busy}
                onChange={(e) => patch({ office: e.target.value }, "Office updated")}
              >
                {OFFICES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </section>
        )}

        {ws.canWrite && (
          <section aria-label="Next steps" className="flex flex-wrap gap-2">
            {r.status !== "converted" ? (
              <Button
                disabled={busy}
                data-testid="convert-request"
                onClick={() =>
                  startBusy(async () => {
                    const result = await convertRequest({ workspaceId: ws.id, requestId: r.id });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Converted to a project");
                    router.push(`/w/${ws.slug}/projects/${result.data.dealId}`);
                  })
                }
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <ArrowRight aria-hidden />
                )}{" "}
                Convert to project
              </Button>
            ) : (
              r.dealId && (
                <Button asChild variant="outline">
                  <Link href={`/w/${ws.slug}/projects/${r.dealId}`}>
                    Open project <ArrowRight aria-hidden />
                  </Link>
                </Button>
              )
            )}
          </section>
        )}

        {extra}

        {ws.canWrite && (
          <section aria-label="Log a call" className="space-y-2 rounded-lg border p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <PhoneCall className="size-4" aria-hidden /> Log a call
            </h3>
            <div
              className="flex flex-wrap gap-3 text-sm"
              role="radiogroup"
              aria-label="Call outcome"
            >
              {(
                [
                  ["reached", "Reached"],
                  ["voicemail", "Voicemail"],
                  ["no_answer", "No answer"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="call-outcome"
                    value={value}
                    checked={outcome === value}
                    onChange={() => setOutcome(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <Label htmlFor="call-note" className="sr-only">
              Call notes
            </Label>
            <Textarea
              id="call-note"
              rows={2}
              placeholder="What did you discuss?"
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={busy || !callNote.trim()}
                data-testid="log-call"
                onClick={() =>
                  startBusy(async () => {
                    const result = await logRequestCall({
                      workspaceId: ws.id,
                      requestId: r.id,
                      call: { body: callNote, outcome },
                    });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    setCallNote("");
                    toast.success("Call logged");
                    router.refresh();
                  })
                }
              >
                Save call
              </Button>
            </div>
          </section>
        )}

        <section aria-label="Activity">
          <h3 className="mb-2 text-sm font-bold">Activity</h3>
          <ActivityTimeline items={activity} emptyText="No activity yet." />
        </section>
      </div>
    </>
  );
}
