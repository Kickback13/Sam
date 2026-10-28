"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { createPost } from "../server/actions";

const EMPTY = {
  title: "",
  body: "",
  property_type: "",
  units: "",
  price: "",
  city: "",
  zip: "",
  link: "",
};

export function PostComposer({
  workspaceId,
  allowPin = false,
  defaultKind = "update",
  postingAs,
}: {
  workspaceId: string;
  allowPin?: boolean;
  defaultKind?: "update" | "deal";
  postingAs: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"update" | "deal">(defaultKind);
  const [v, setV] = useState(EMPTY);
  const [pinned, setPinned] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set =
    (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => errors[k]?.[0];

  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid="post-composer"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await createPost({ workspaceId, values: { kind, ...v }, pinned });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          setV(EMPTY);
          setPinned(false);
          toast.success("Posted");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Post type"
          className="inline-flex rounded-md border p-0.5"
        >
          {(["update", "deal"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-9 rounded px-3 text-sm font-semibold ${kind === k ? "bg-brand-ink text-white" : "text-muted-foreground"}`}
            >
              {k === "update" ? "Update" : "Share a deal"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Posting as {postingAs}</span>
      </div>
      <Field id="pc-title" label="Title" error={err("title")}>
        <Input
          id="pc-title"
          value={v.title}
          maxLength={200}
          onChange={set("title")}
          aria-invalid={Boolean(err("title"))}
        />
      </Field>
      {kind === "deal" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field id="pc-type" label="Type" help="e.g. multifamily">
            <Input
              id="pc-type"
              value={v.property_type}
              maxLength={40}
              onChange={set("property_type")}
            />
          </Field>
          <Field id="pc-units" label="Units" error={err("units")}>
            <Input
              id="pc-units"
              inputMode="numeric"
              value={v.units}
              onChange={set("units")}
              aria-invalid={Boolean(err("units"))}
            />
          </Field>
          <Field id="pc-price" label="Price ($)" error={err("price")}>
            <Input
              id="pc-price"
              inputMode="decimal"
              value={v.price}
              onChange={set("price")}
              aria-invalid={Boolean(err("price"))}
            />
          </Field>
          <Field id="pc-city" label="City">
            <Input id="pc-city" value={v.city} maxLength={100} onChange={set("city")} />
          </Field>
          <Field id="pc-zip" label="ZIP">
            <Input id="pc-zip" value={v.zip} maxLength={20} onChange={set("zip")} />
          </Field>
        </div>
      )}
      <Field id="pc-body" label={kind === "deal" ? "Details" : "Message"} error={err("body")}>
        <Textarea id="pc-body" rows={4} value={v.body} onChange={set("body")} />
      </Field>
      <Field id="pc-link" label="Link (optional)" error={err("link")}>
        <Input
          id="pc-link"
          type="url"
          value={v.link}
          onChange={set("link")}
          aria-invalid={Boolean(err("link"))}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {allowPin ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-black"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Pin to the top
          </label>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          disabled={!hydrated || pending || !v.title.trim()}
          data-testid="post-submit"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Post
        </Button>
      </div>
    </form>
  );
}
