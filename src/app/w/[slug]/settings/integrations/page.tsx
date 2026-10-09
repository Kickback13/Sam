import { PlugZap } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { INTEGRATIONS, plannedOwner } from "@/lib/integrations";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Integrations" };

const STATUS = {
  not_connected: { label: "Not connected", variant: "secondary" },
  connected: { label: "Connected", variant: "success" },
  error: { label: "Error", variant: "danger" },
} as const;

export default async function IntegrationsPage({
  params,
}: PageProps<"/w/[slug]/settings/integrations">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const supabase = await createClient();
  const [{ data: rows }, { data: ws }] = await Promise.all([
    supabase
      .from("integrations")
      .select("provider, status, account_email, connected_at, last_error")
      .eq("workspace_id", workspace.id),
    supabase.from("workspaces").select("owner_email").eq("id", workspace.id).single(),
  ]);
  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Nothing here is connected yet, and nothing is simulated. Each integration is connected in
        the phase listed, under Sam&apos;s own account — tokens will live in Supabase Vault, never
        in the database tables.
      </p>
      <div className="grid gap-4 md:grid-cols-2" data-testid="integrations">
        {INTEGRATIONS.map((i) => {
          const row = byProvider.get(i.provider);
          const status = STATUS[row?.status ?? "not_connected"];
          return (
            <Card key={i.provider}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-sans text-base font-bold">
                    <PlugZap className="size-4 text-muted-foreground" aria-hidden />
                    {i.name}
                  </h2>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{i.purpose}</p>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Account owner</dt>
                  <dd>
                    {row?.account_email ??
                      (workspace.isDemo
                        ? plannedOwner(workspace.businessType, true)
                        : ws?.owner_email
                          ? `${ws.owner_email} (planned)`
                          : `${plannedOwner(workspace.businessType, false)} — email TBD`)}
                  </dd>
                  <dt className="text-muted-foreground">Connects in</dt>
                  <dd>Phase {i.phase}</dd>
                  {row?.last_error && (
                    <>
                      <dt className="text-muted-foreground">Last error</dt>
                      <dd className="text-brand-danger">{row.last_error}</dd>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
