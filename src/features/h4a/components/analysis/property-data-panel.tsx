"use client";

import { Database, Loader2, PlugZap, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";

import { formatAddress, propertyFacts } from "../../property-data/rentcast";
import { fetchPropertyData } from "../../server/property-data";
import type { DataApiState, PropertyPulls } from "../../server/property-data-queries";

const KIND_LABEL = { record: "property record", value: "value estimate", rent: "rent estimate" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 border-b py-1 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold tabular">{value ?? "—"}</dd>
    </div>
  );
}

function Source({ at }: { at: string }) {
  return (
    <p className="text-xs text-muted-foreground">Source: RentCast · fetched {formatDateTime(at)}</p>
  );
}

/** Analysis page: ownership, tax, sale history and estimates from RentCast (Phase 3B). */
export function PropertyDataPanel({
  propertyId,
  state,
  pulls,
}: {
  propertyId: string;
  state: DataApiState;
  pulls: PropertyPulls;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const left = Math.max(0, state.monthlyLimit - state.used);

  const run = (kind: "record" | "value" | "rent") => {
    setBusy(kind);
    start(async () => {
      const r = await fetchPropertyData({ workspaceId: ws.id, propertyId, kind });
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.status === "not_found")
        toast.message(`RentCast has no ${KIND_LABEL[kind]} for this address.`);
      else
        toast.success(
          kind === "record" && r.data.filled.length
            ? `Property record fetched · filled ${r.data.filled.length} blank field${r.data.filled.length === 1 ? "" : "s"}`
            : `${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)} fetched`,
        );
      router.refresh();
    });
  };

  const facts = pulls.record ? propertyFacts(pulls.record.payload) : null;

  return (
    <Card data-testid="property-data-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" aria-hidden /> Ownership, tax &amp; estimates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1 text-sm">
        {!state.connected ? (
          <>
            <p className="inline-flex items-center gap-1.5 rounded border border-dashed px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              <PlugZap className="size-3.5" aria-hidden /> Not connected
            </p>
            <p className="text-muted-foreground">
              Owner, tax, sale history and value / rent estimates come from RentCast (Sam&apos;s
              account). {ws.isAdmin ? "Add the API key in " : "An owner or admin adds it in "}
              {ws.isAdmin ? (
                <Link
                  className="underline"
                  href={`/w/${ws.slug}/settings/integrations/property-data`}
                >
                  Settings → Integrations
                </Link>
              ) : (
                "Settings → Integrations"
              )}
              . Until then nothing here is filled in.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground" data-testid="data-usage">
              {formatNumber(state.used)} of {formatNumber(state.monthlyLimit)} requests used this
              month · each button below is one request.
            </p>
            {ws.canWrite && (
              <div className="flex flex-wrap gap-2">
                {(["record", "value", "rent"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="outline"
                    disabled={pending || left === 0}
                    onClick={() => run(k)}
                    data-testid={`fetch-${k}`}
                  >
                    {busy === k ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw aria-hidden />
                    )}
                    {pulls[k] ? "Refresh" : "Fetch"} {KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
            )}
            {left === 0 && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs">
                This month&apos;s limit is used up. An owner or admin can raise it in Settings →
                Integrations.
              </p>
            )}
          </>
        )}

        {pulls.lastMiss && (
          <p className="text-xs text-muted-foreground" data-testid="data-miss">
            Last {KIND_LABEL[pulls.lastMiss.kind as keyof typeof KIND_LABEL] ?? "request"} (
            {formatDateTime(pulls.lastMiss.fetchedAt)}): {pulls.lastMiss.message ?? "no result"}
          </p>
        )}

        {facts && pulls.record && (
          <section className="space-y-1" data-testid="data-record">
            <h3 className="text-sm font-bold">Public record</h3>
            <dl>
              <Row label="Owner" value={facts.ownerNames.join(", ") || null} />
              <Row label="Owner mailing address" value={facts.ownerMailingAddress} />
              <Row
                label="Owner occupied"
                value={facts.ownerOccupied === null ? null : facts.ownerOccupied ? "Yes" : "No"}
              />
              <Row
                label="Last sale"
                value={
                  facts.lastSaleDate
                    ? `${formatDate(facts.lastSaleDate)}${facts.lastSalePrice ? ` · ${formatCurrency(facts.lastSalePrice)}` : ""}`
                    : null
                }
              />
              <Row
                label={`Assessed value${facts.assessedYear ? ` (${facts.assessedYear})` : ""}`}
                value={facts.assessedValue === null ? null : formatCurrency(facts.assessedValue)}
              />
              <Row
                label={`Property tax${facts.annualTaxYear ? ` (${facts.annualTaxYear})` : ""}`}
                value={facts.annualTax === null ? null : formatCurrency(facts.annualTax)}
              />
              <Row label="APN" value={facts.apn} />
              <Row label="Units" value={facts.units === null ? null : formatNumber(facts.units)} />
            </dl>
            {facts.saleHistory.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sales:{" "}
                {facts.saleHistory
                  .map(
                    (h) => `${formatDate(h.date)}${h.price ? ` ${formatCurrency(h.price)}` : ""}`,
                  )
                  .join(" · ")}
              </p>
            )}
            <Source at={pulls.record.fetchedAt} />
          </section>
        )}

        {pulls.value && (
          <section className="space-y-1" data-testid="data-value">
            <h3 className="text-sm font-bold">Value estimate</h3>
            <p className="font-semibold tabular">
              {pulls.value.payload.price ? formatCurrency(pulls.value.payload.price) : "—"}
              {pulls.value.payload.priceRangeLow && pulls.value.payload.priceRangeHigh && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (range {formatCurrency(pulls.value.payload.priceRangeLow)} –{" "}
                  {formatCurrency(pulls.value.payload.priceRangeHigh)})
                </span>
              )}
            </p>
            <Comparables list={pulls.value.payload.comparables} />
            <Source at={pulls.value.fetchedAt} />
          </section>
        )}

        {pulls.rent && (
          <section className="space-y-1" data-testid="data-rent">
            <h3 className="text-sm font-bold">Rent estimate (per unit, monthly)</h3>
            <p className="font-semibold tabular">
              {pulls.rent.payload.rent ? formatCurrency(pulls.rent.payload.rent) : "—"}
              {pulls.rent.payload.rentRangeLow && pulls.rent.payload.rentRangeHigh && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (range {formatCurrency(pulls.rent.payload.rentRangeLow)} –{" "}
                  {formatCurrency(pulls.rent.payload.rentRangeHigh)})
                </span>
              )}
            </p>
            <Comparables list={pulls.rent.payload.comparables} />
            <Source at={pulls.rent.fetchedAt} />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function Comparables({
  list,
}: {
  list:
    | { price?: number | null; formattedAddress?: string | null; distance?: number | null }[]
    | null
    | undefined;
}) {
  if (!list?.length) return null;
  return (
    <ul className="text-xs text-muted-foreground">
      {list.slice(0, 5).map((c, i) => (
        <li key={i}>
          {formatAddress(c) ?? "Comparable"}
          {c.price ? ` · ${formatCurrency(c.price)}` : ""}
          {typeof c.distance === "number" ? ` · ${c.distance.toFixed(1)} mi` : ""}
        </li>
      ))}
    </ul>
  );
}
