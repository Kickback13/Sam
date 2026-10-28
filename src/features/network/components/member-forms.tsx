"use client";

import { CalendarCheck, CalendarX, Loader2, LogIn, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import {
  addComment,
  deleteComment,
  joinNetwork,
  setRsvp,
  updateMyProfile,
} from "../server/actions";

export function CommentForm({ workspaceId, postId }: { workspaceId: string; postId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      data-testid="comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addComment({ workspaceId, postId, values: { body } });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <Field id="c-body" label="Add a comment" className="flex-1">
        <Textarea
          id="c-body"
          rows={2}
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        disabled={!hydrated || pending || !body.trim()}
        aria-label="Send comment"
        data-testid="comment-submit"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      </Button>
    </form>
  );
}

export function DeleteCommentButton({ workspaceId, id }: { workspaceId: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label="Delete comment"
      onClick={() =>
        start(async () => {
          const r = await deleteComment({ workspaceId, id });
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

export function RsvpButtons({
  workspaceId,
  eventId,
  mine,
}: {
  workspaceId: string;
  eventId: string;
  mine: "going" | "not_going" | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const rsvp = (status: "going" | "not_going") =>
    start(async () => {
      const r = await setRsvp({ workspaceId, eventId, status });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(status === "going" ? "See you there" : "Got it — not going");
        router.refresh();
      }
    });
  return (
    <div className="flex gap-2" role="group" aria-label="RSVP">
      <Button
        size="sm"
        variant={mine === "going" ? "default" : "outline"}
        aria-pressed={mine === "going"}
        disabled={pending}
        onClick={() => rsvp("going")}
        data-testid="rsvp-going"
      >
        <CalendarCheck aria-hidden /> Going
      </Button>
      <Button
        size="sm"
        variant={mine === "not_going" ? "default" : "outline"}
        aria-pressed={mine === "not_going"}
        disabled={pending}
        onClick={() => rsvp("not_going")}
      >
        <CalendarX aria-hidden /> Can&apos;t make it
      </Button>
    </div>
  );
}

export type ProfileInitial = {
  display_name: string;
  headline: string;
  bio: string;
  city: string;
  show_in_directory: boolean;
  public_email: string;
  public_phone: string;
};

export function ProfileForm({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: ProfileInitial;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const text =
    (k: Exclude<keyof ProfileInitial, "show_in_directory">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => errors[k]?.[0];
  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await updateMyProfile({ workspaceId, values: v });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          toast.success("Profile saved");
          router.refresh();
        });
      }}
    >
      <Field id="pf-name" label="Name" error={err("display_name")}>
        <Input
          id="pf-name"
          value={v.display_name}
          maxLength={120}
          onChange={text("display_name")}
        />
      </Field>
      <Field id="pf-headline" label="Headline" help="e.g. “Value-add investor, 20–80 units”.">
        <Input id="pf-headline" value={v.headline} maxLength={160} onChange={text("headline")} />
      </Field>
      <Field id="pf-city" label="City">
        <Input id="pf-city" value={v.city} maxLength={100} onChange={text("city")} />
      </Field>
      <Field id="pf-bio" label="About you">
        <Textarea id="pf-bio" rows={3} value={v.bio} maxLength={2000} onChange={text("bio")} />
      </Field>
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-bold">What other members see</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-black"
            checked={v.show_in_directory}
            onChange={(e) => setV((s) => ({ ...s, show_in_directory: e.target.checked }))}
          />
          List me in the member directory
        </label>
        <Field
          id="pf-email"
          label="Email to show (optional)"
          error={err("public_email")}
          help="Only if you want members to reach you directly."
        >
          <Input
            id="pf-email"
            type="email"
            value={v.public_email}
            onChange={text("public_email")}
          />
        </Field>
        <Field id="pf-phone" label="Phone to show (optional)">
          <Input
            id="pf-phone"
            type="tel"
            value={v.public_phone}
            maxLength={40}
            onChange={text("public_phone")}
          />
        </Field>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" disabled={!hydrated || pending} data-testid="profile-save">
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save profile
        </Button>
      </div>
    </form>
  );
}

export function JoinForm({
  token,
  defaultName,
  networkName,
}: {
  token: string;
  defaultName: string;
  networkName: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      data-testid="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await joinNetwork({ token, displayName: name });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          router.push(`/n/${r.data.slug}`);
        });
      }}
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <Field id="join-name" label="Your name, as members will see it">
        <Input
          id="join-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </Field>
      <Button
        type="submit"
        className="w-full"
        disabled={!hydrated || pending || !name.trim()}
        data-testid="join-submit"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Join{" "}
        {networkName}
      </Button>
    </form>
  );
}
