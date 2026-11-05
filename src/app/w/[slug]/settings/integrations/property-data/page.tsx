import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { DataApiForm } from "@/features/h4a/components/data-api-form";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { getDataApiState } from "@/features/h4a/server/property-data-queries";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Property data (RentCast)" };

export default async function PropertyDataSettingsPage({
  params,
}: PageProps<"/w/[slug]/settings/integrations/property-data">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getRealEstateContext(slug);
  const state = await getDataApiState(workspace.id);
  return (
    <div className="space-y-4">
      <Link
        href={`/w/${slug}/settings/integrations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Integrations
      </Link>
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 font-sans text-lg font-bold">
          Property data · RentCast{" "}
          <Badge variant={state.connected ? "success" : "secondary"} data-testid="data-api-status">
            {state.connected ? "Connected" : "Not connected"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Owner, tax, sale history and value / rent estimates for a property, fetched only when
          someone clicks a button on its analysis page. Every value shows that it came from RentCast
          and when.
        </p>
      </div>
      {state.connected && (
        <div className="rounded-xl border bg-card p-4 text-sm" data-testid="data-api-usage">
          <p>
            <span className="font-semibold tabular">
              {formatNumber(state.used)} of {formatNumber(state.monthlyLimit)}
            </span>{" "}
            requests used this month.
          </p>
          {state.connectedAt && (
            <p className="text-muted-foreground">Connected {formatDateTime(state.connectedAt)}</p>
          )}
          {state.lastError && <p className="text-brand-danger">Last error: {state.lastError}</p>}
        </div>
      )}
      {isAdmin ? (
        <DataApiForm connected={state.connected} monthlyLimit={state.monthlyLimit} />
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Only owners and admins can connect RentCast.
        </p>
      )}
    </div>
  );
}
