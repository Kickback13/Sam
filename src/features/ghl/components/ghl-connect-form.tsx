"use client";

import { Loader2, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import { connectGhl, disconnectGhl } from "../server/actions";

export function GhlConnectForm() {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [token, setToken] = useState("");
  const [locationId, setLocationId] = useState("");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="ghl-connect-form"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setFormError(null);
        start(async () => {
          const r = await connectGhl({ workspaceId: ws.id, token, locationId, label });
          if (!r.ok) {
            setFormError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          setToken("");
          toast.success(
            `Connected · ${r.data.contacts ?? "?"} contacts and ${r.data.pipelines} pipeline${r.data.pipelines === 1 ? "" : "s"} found`,
          );
          router.refresh();
        });
      }}
    >
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {formError}
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          In GoHighLevel, open the sub-account → <strong>Settings → Private Integrations</strong> →{" "}
          <strong>Create new integration</strong>.
        </li>
        <li>
          Give it read access to <strong>Contacts</strong> and <strong>Opportunities</strong> (
          <code>contacts.readonly</code>, <code>opportunities.readonly</code>) — nothing else is
          needed.
        </li>
        <li>Copy the token it shows and paste it below.</li>
        <li>
          The Location ID is under <strong>Settings → Business Profile</strong> (also in the address
          bar after <code>/location/</code>).
        </li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="ghl-token"
          label="Private Integration token"
          error={errors.token?.[0]}
          help="Stored encrypted in Supabase Vault; never shown again."
          className="sm:col-span-2"
        >
          <Input
            id="ghl-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-invalid={Boolean(errors.token)}
          />
        </Field>
        <Field id="ghl-location" label="Location ID" error={errors.locationId?.[0]}>
          <Input
            id="ghl-location"
            autoComplete="off"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            aria-invalid={Boolean(errors.locationId)}
          />
        </Field>
        <Field id="ghl-label" label="Label (optional)" help="e.g. “AZH Builders GHL”.">
          <Input
            id="ghl-label"
            value={label}
            maxLength={200}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!hydrated || pending || !token || !locationId}
          data-testid="ghl-connect"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
          Test and connect
        </Button>
      </div>
    </form>
  );
}

export function GhlDisconnectButton() {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-brand-danger"
      disabled={pending}
      data-testid="ghl-disconnect"
      onClick={() => {
        if (
          !confirm(
            "Disconnect GoHighLevel? The token is deleted; imported contacts and deals stay.",
          )
        )
          return;
        start(async () => {
          const r = await disconnectGhl({ workspaceId: ws.id });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("GoHighLevel disconnected");
          router.refresh();
        });
      }}
    >
      Disconnect
    </Button>
  );
}
