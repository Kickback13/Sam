"use client";

import { Ban, CalendarPlus, Check, Copy, Loader2, RotateCcw, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { MEMBER_TYPES } from "../schema";
import {
  cancelEvent,
  createEvent,
  createNetworkInvite,
  revokeNetworkInvite,
  updateMemberAdmin,
} from "../server/actions";

function inviteUrl(slug: string, token: string) {
  return `${window.location.origin}/n/${slug}/join/${token}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Invite link copied");
  } catch {
    toast.message(text);
  }
}

export function InviteForm() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ email: "", name: "", member_type: "investor" });
  const [link, setLink] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!ws.canWrite) return null;
  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="network-invite-form"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await createNetworkInvite({ workspaceId: ws.id, values: v });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          const url = inviteUrl(ws.slug, r.data.token);
          setLink(url);
          setV({ email: "", name: "", member_type: v.member_type });
          router.refresh();
        });
      }}
    >
      <h2 className="font-sans text-base font-bold">Invite someone</h2>
      <p className="text-sm text-muted-foreground">
        Creates a private link to send them (text or email it yourself — automatic invite emails
        come with Resend). With an email, only that address can use the link.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="ni-name" label="Name (optional)">
          <Input
            id="ni-name"
            value={v.name}
            maxLength={120}
            onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
          />
        </Field>
        <Field id="ni-email" label="Email (optional)" error={errors.email?.[0]}>
          <Input
            id="ni-email"
            type="email"
            value={v.email}
            onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))}
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        <Field id="ni-type" label="Member type">
          <NativeSelect
            id="ni-type"
            value={v.member_type}
            onChange={(e) => setV((s) => ({ ...s, member_type: e.target.value }))}
          >
            {MEMBER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {link && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm"
          data-testid="invite-link"
        >
          <code className="min-w-0 flex-1 break-all">{link}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => copy(link)}>
            <Copy aria-hidden /> Copy
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!hydrated || pending} data-testid="network-invite-submit">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}{" "}
          Create invite link
        </Button>
      </div>
    </form>
  );
}

export function InviteRowActions({ id, token }: { id: string; token: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => copy(inviteUrl(ws.slug, token))}>
        <Copy aria-hidden /> Copy link
      </Button>
      {ws.canWrite && (
        <Button
          size="sm"
          variant="ghost"
          className="text-brand-danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revokeNetworkInvite({ workspaceId: ws.id, id });
              if (!r.ok) toast.error(r.error);
              else {
                toast.success("Invite withdrawn");
                router.refresh();
              }
            })
          }
        >
          <X aria-hidden /> Withdraw
        </Button>
      )}
    </div>
  );
}

export function MemberAdminControls({
  id,
  memberType,
  tags,
  status,
}: {
  id: string;
  memberType: string;
  tags: string[];
  status: "active" | "removed";
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState(memberType);
  const [tagText, setTagText] = useState(tags.join(", "));
  if (!ws.canWrite) return null;
  const save = (next: { status?: "active" | "removed" } = {}) =>
    start(async () => {
      const r = await updateMemberAdmin({
        workspaceId: ws.id,
        id,
        values: {
          member_type: type,
          tags: tagText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          status: next.status ?? status,
        },
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(
          next.status === "removed"
            ? "Removed from the Network"
            : next.status === "active"
              ? "Restored"
              : "Saved",
        );
        router.refresh();
      }
    });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field id={`mt-${id}`} label="Type">
        <NativeSelect
          id={`mt-${id}`}
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-w-36"
        >
          {MEMBER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`tg-${id}`} label="Segments (tags)" className="min-w-44 flex-1">
        <Input
          id={`tg-${id}`}
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="e.g. 1031, north-county"
        />
      </Field>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => save()}
        aria-label="Save member"
      >
        <Check aria-hidden /> Save
      </Button>
      {status === "active" ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-brand-danger"
          disabled={pending}
          onClick={() => {
            if (
              confirm("Remove this member? They lose access right away; their CRM contact stays.")
            )
              save({ status: "removed" });
          }}
        >
          <Ban aria-hidden /> Remove
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => save({ status: "active" })}
        >
          <RotateCcw aria-hidden /> Restore
        </Button>
      )}
    </div>
  );
}

export function EventForm() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    title: "",
    description: "",
    starts: "",
    ends: "",
    location: "",
    url: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!ws.canWrite) return null;
  const set =
    (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));
  // <input type="datetime-local"> is local time; send it with the browser's offset.
  const iso = (local: string) => (local ? new Date(local).toISOString() : null);
  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="network-event-form"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await createEvent({
            workspaceId: ws.id,
            values: {
              title: v.title,
              description: v.description,
              starts_at: iso(v.starts),
              ends_at: iso(v.ends),
              location: v.location,
              url: v.url,
            },
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          setV({ title: "", description: "", starts: "", ends: "", location: "", url: "" });
          toast.success("Event created");
          router.refresh();
        });
      }}
    >
      <h2 className="font-sans text-base font-bold">New event</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ev-title" label="Title" error={errors.title?.[0]} className="sm:col-span-2">
          <Input id="ev-title" value={v.title} maxLength={200} onChange={set("title")} />
        </Field>
        <Field id="ev-starts" label="Starts" error={errors.starts_at?.[0]}>
          <Input id="ev-starts" type="datetime-local" value={v.starts} onChange={set("starts")} />
        </Field>
        <Field id="ev-ends" label="Ends (optional)" error={errors.ends_at?.[0]}>
          <Input id="ev-ends" type="datetime-local" value={v.ends} onChange={set("ends")} />
        </Field>
        <Field id="ev-location" label="Where">
          <Input id="ev-location" value={v.location} maxLength={300} onChange={set("location")} />
        </Field>
        <Field id="ev-url" label="Link (optional)" error={errors.url?.[0]}>
          <Input id="ev-url" type="url" value={v.url} onChange={set("url")} />
        </Field>
        <Field id="ev-desc" label="Details" className="sm:col-span-2">
          <Textarea id="ev-desc" rows={3} value={v.description} onChange={set("description")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!hydrated || pending || !v.title || !v.starts}
          data-testid="network-event-submit"
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <CalendarPlus aria-hidden />
          )}{" "}
          Create event
        </Button>
      </div>
    </form>
  );
}

export function CancelEventButton({ id }: { id: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-brand-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm("Cancel this event? Members will see it as canceled.")) return;
        start(async () => {
          const r = await cancelEvent({ workspaceId: ws.id, id });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Event canceled");
            router.refresh();
          }
        });
      }}
    >
      Cancel event
    </Button>
  );
}
