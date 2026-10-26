import { formatDateTime } from "@/lib/format";

import type { ListingEvent } from "../server/queries";

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  apn: "APN",
  property_type: "Type",
  price: "Price",
  units: "Units",
  cap_rate: "Cap rate",
  year_built: "Year built",
  building_sqft: "Building sq ft",
  lot_sqft: "Lot sq ft",
  submarket: "Submarket",
  broker_name: "Broker",
  broker_company: "Brokerage",
  broker_phone: "Broker phone",
  broker_email: "Broker email",
  listing_url: "Listing link",
};

type Changes = {
  changed?: Record<string, { from?: unknown; to?: unknown }>;
  kept?: Record<string, { kept?: unknown; offered?: unknown; kept_source?: unknown }>;
  reason?: string;
  note?: string;
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Everything that happened to a listing: arrivals, repeats, field changes, status, verification. */
export function ListingHistory({ events }: { events: ListingEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="space-y-3" data-testid="listing-history">
      {events.map((e) => {
        const c = (e.changes ?? {}) as Changes;
        const changed = Object.entries(c.changed ?? {});
        const kept = Object.entries(c.kept ?? {});
        const who = e.actor?.full_name || e.actor?.email || null;
        return (
          <li key={e.id} className="border-l-2 pl-3" data-event-kind={e.kind}>
            <p className="text-sm font-semibold">{e.summary ?? e.kind}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(e.created_at)}
              {who ? ` · ${who}` : ""}
            </p>
            {e.kind !== "created" && changed.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {changed.map(([field, v]) => (
                  <li key={field}>
                    {FIELD_LABELS[field] ?? field}:{" "}
                    <s className="text-muted-foreground">{show(v.from)}</s> →{" "}
                    <strong>{show(v.to)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {kept.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {kept.map(([field, v]) => (
                  <li key={field}>
                    {FIELD_LABELS[field] ?? field}: kept {show(v.kept)}
                    {v.kept_source ? ` (${String(v.kept_source)})` : ""}; this source said{" "}
                    {show(v.offered)}
                  </li>
                ))}
              </ul>
            )}
            {c.note && <p className="mt-1 text-xs">Note: {c.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
