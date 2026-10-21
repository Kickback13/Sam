"use client";

import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

import { createInboundAddress } from "../server/actions/inbound-address";

/** Create or replace the forwarding address. The full address is shown once. */
export function InboundAddressButton({ exists }: { exists: boolean }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ address: string | null; token: string } | null>(null);
  if (!ws.isAdmin) return null;
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!hydrated || pending}
        data-testid="create-inbound-address"
        onClick={() => {
          if (
            exists &&
            !confirm("Replace the forwarding address? The old address stops working right away.")
          )
            return;
          start(async () => {
            const r = await createInboundAddress({ workspaceId: ws.id });
            if (!r.ok) return void toast.error(r.error);
            setCreated({ address: r.data.address, token: r.data.token });
            router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {exists ? "Replace forwarding address" : "Create forwarding address"}
      </Button>
      {created && (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Copy this now — it won&apos;t be shown again.</p>
          <p className="mt-1 font-mono text-xs break-all" data-testid="new-inbound-address">
            {created.address ??
              `deals.${created.token}@<inbound domain once INBOUND_EMAIL_DOMAIN is set>`}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => {
              void navigator.clipboard?.writeText(created.address ?? `deals.${created.token}`);
              toast.success("Copied");
            }}
          >
            <Copy aria-hidden /> Copy
          </Button>
        </div>
      )}
    </div>
  );
}
