import type { Metadata } from "next";

import { BuyBoxForm } from "@/features/h4a/components/buy-box-form";
import { isBuyBoxEmpty } from "@/features/h4a/scoring/score";
import { buyBoxFromRow, CRITERION_WEIGHTS } from "@/features/h4a/scoring/score";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { getBuyBoxRow } from "@/features/h4a/server/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Buy box" };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));

export default async function BuyBoxPage({ params }: PageProps<"/w/[slug]/settings/buy-box">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getRealEstateContext(slug);
  const row = await getBuyBoxRow(workspace.id);
  const empty = isBuyBoxEmpty(buyBoxFromRow(row));
  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          The buy box scores every listing 0–100. Only the rules you set count; missing listing data
          is “unknown” and never passes. Saving re-scores every open listing.
        </p>
        <p className="text-xs">
          Weights: location {CRITERION_WEIGHTS.location} · units {CRITERION_WEIGHTS.units} · price
          per unit {CRITERION_WEIGHTS.price_per_unit} · price {CRITERION_WEIGHTS.price} · type{" "}
          {CRITERION_WEIGHTS.property_type} · year built {CRITERION_WEIGHTS.year_built}.
        </p>
        {row && (
          <p className="text-xs" data-testid="buy-box-meta">
            Version {row.version} · last saved {formatDateTime(row.updated_at)}
            {row.editor ? ` by ${row.editor.full_name ?? row.editor.email}` : ""}
          </p>
        )}
        {empty && (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
            data-testid="buy-box-empty"
          >
            Empty — nothing is scored until you fill it in.
          </p>
        )}
        {!isAdmin && (
          <p className="rounded-md bg-muted px-3 py-2">
            Only owners and admins can edit the buy box.
          </p>
        )}
      </div>
      <BuyBoxForm
        readOnly={!isAdmin}
        initial={{
          zips: row?.zips ?? [],
          cities: row?.cities ?? [],
          submarkets: row?.submarkets ?? [],
          property_types: row?.property_types ?? [],
          units_min: s(row?.units_min),
          units_max: s(row?.units_max),
          price_min: s(row?.price_min),
          price_max: s(row?.price_max),
          max_price_per_unit: s(row?.max_price_per_unit),
          year_built_min: s(row?.year_built_min),
          year_built_max: s(row?.year_built_max),
          notes: row?.notes ?? "",
          alert_threshold: String(row?.alert_threshold ?? 70),
        }}
      />
    </div>
  );
}
