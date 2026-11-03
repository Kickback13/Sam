import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { GhlAutoImportCard } from "@/features/ghl/components/ghl-auto-import";
import { GhlConnectForm, GhlDisconnectButton } from "@/features/ghl/components/ghl-connect-form";
import { GhlContactImport, GhlOpportunityImport } from "@/features/ghl/components/ghl-import-panel";
import {
  countGhlLinkedDeals,
  defaultPipelineId,
  fetchGhlPipelines,
  getGhlAutoImport,
  getGhlConnection,
  listGhlImports,
  loadLocalStages,
} from "@/features/ghl/server/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "GoHighLevel import" };

export default async function GhlPage({
  params,
}: PageProps<"/w/[slug]/settings/integrations/gohighlevel">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getWorkspaceContext(slug);
  const conn = await getGhlConnection(workspace.id);
  const connected = conn.status === "connected";

  const back = (
    <Link
      href={`/w/${slug}/settings/integrations`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Integrations
    </Link>
  );

  if (!isAdmin)
    return (
      <div className="space-y-3">
        {back}
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Only owners and admins can connect GoHighLevel and run the import.
        </p>
      </div>
    );

  const [imports, stages, pipelineId, linked, ghl, auto] = await Promise.all([
    listGhlImports(workspace.id),
    loadLocalStages(workspace.id),
    defaultPipelineId(workspace.id),
    countGhlLinkedDeals(workspace.id),
    connected ? fetchGhlPipelines(workspace.id) : Promise.resolve(null),
    getGhlAutoImport(workspace.id),
  ]);

  return (
    <div className="space-y-4">
      {back}
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 font-sans text-lg font-bold">
          GoHighLevel → {workspace.name}{" "}
          <Badge variant={connected ? "success" : "secondary"} data-testid="ghl-status">
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Brings this workspace&apos;s GoHighLevel contacts and opportunities here — once, or
          automatically until GHL is cancelled. Read-only: nothing is changed or sent in
          GoHighLevel. Repeats merge instead of duplicating.
        </p>
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm">
          <div>
            <p className="font-semibold">{conn.label || "GoHighLevel sub-account"}</p>
            <p className="text-muted-foreground">
              Location {conn.locationId}
              {conn.connectedAt ? ` · connected ${formatDateTime(conn.connectedAt)}` : ""}
            </p>
            {conn.lastError && <p className="text-brand-danger">Last error: {conn.lastError}</p>}
          </div>
          <GhlDisconnectButton />
        </div>
      ) : (
        <GhlConnectForm />
      )}

      {connected && (
        <>
          <GhlAutoImportCard state={auto} />
          <GhlContactImport />
          {ghl && !ghl.ok ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {ghl.error}
            </p>
          ) : (
            <GhlOpportunityImport
              ghlPipelines={ghl?.ok ? ghl.pipelines : []}
              localStages={stages}
              defaultPipelineId={pipelineId}
              alreadyLinked={linked}
            />
          )}
        </>
      )}

      {imports.length > 0 && (
        <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="ghl-hist">
          <h2 id="ghl-hist" className="mb-2 font-sans text-base font-bold">
            Earlier contact imports
          </h2>
          <ul className="divide-y" data-testid="ghl-history">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <Link href={`/w/${slug}/people/import/${i.id}`} className="underline">
                  {formatDateTime(i.created_at)}
                </Link>
                <span className="text-muted-foreground">
                  {i.status} · {formatNumber(i.created_count)} new · {formatNumber(i.updated_count)}{" "}
                  merged · {formatNumber(i.error_count)} errors
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
