import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { requestOrigin } from "@/server/origin";

import { alertEmailConfig } from "../alerts/email";
import { inboundConfig, inngestEnabled } from "../server/config";
import { getInboundAddress } from "../server/queries";
import { InboundAddressButton } from "./inbound-address-button";

/**
 * Settings → Integrations (real estate): the Deal Finder forwarding address.
 * "Not connected" until Resend inbound is set up on Sam's account (ADR-022,
 * docs/ACCOUNTS.md). Env var names are shown; values never are.
 */
export async function InboundEmailCard({
  workspaceId,
  isAdmin,
}: {
  workspaceId: string;
  isAdmin: boolean;
}) {
  const cfg = inboundConfig();
  const address = isAdmin ? await getInboundAddress(workspaceId) : null;
  const connected = cfg.connected && Boolean(address);
  const origin = await requestOrigin();
  const alerts = alertEmailConfig();
  return (
    <Card data-testid="inbound-email-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 font-sans text-base font-bold">
            <Inbox className="size-4 text-muted-foreground" aria-hidden />
            Forwarded alert emails (Deal Finder)
          </h2>
          <Badge variant={connected ? "success" : "secondary"} data-testid="inbound-status">
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Forward your saved-search alert emails to the address below and each listing lands in Deal
          Finder, deduped and scored. Uses Resend inbound on Sam&apos;s account.
        </p>
        <dl className="grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[150px_1fr]">
          <dt className="text-muted-foreground">Forwarding address</dt>
          <dd className="font-mono text-xs break-all" data-testid="inbound-address">
            {!isAdmin
              ? "Visible to owners and admins"
              : address
                ? `deals.••••••••••••••••${address.token_hint}@${cfg.domain ?? "<inbound domain not set>"}`
                : "Not created yet"}
          </dd>
          {address && (
            <>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                {formatDate(address.updated_at)}
                {address.creator ? ` by ${address.creator.full_name ?? address.creator.email}` : ""}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Webhook URL</dt>
          <dd className="font-mono text-xs break-all">{origin}/api/inbound/email</dd>
          <dt className="text-muted-foreground">Still needed</dt>
          <dd>
            {cfg.missing.length === 0 && address
              ? "Nothing — ready"
              : [
                  ...cfg.missing.map((m) => `${m} (Vercel env)`),
                  ...(address ? [] : ["a forwarding address"]),
                ].join(" · ")}
          </dd>
          <dt className="text-muted-foreground">Background jobs</dt>
          <dd>
            {inngestEnabled()
              ? "Inngest (retries on failure)"
              : "Run right away (Inngest not configured here)"}
          </dd>
          <dt className="text-muted-foreground">Alert email to owner</dt>
          <dd>{alerts.enabled ? "On" : "Not connected — off until Resend is set up"}</dd>
        </dl>
        <InboundAddressButton exists={Boolean(address)} />
      </CardContent>
    </Card>
  );
}
