"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/server/actions/invites";

export function AcceptInviteButton({ token, label }: { token: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvite(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {label}
      </Button>
    </div>
  );
}
