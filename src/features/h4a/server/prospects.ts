import "server-only";

import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";

import {
  heldSinceCutoff,
  rankBrokers,
  yearsHeld,
  type Broker,
  type BrokerListing,
  type BrokerSort,
} from "../prospects/rank";

/** Most listings read for the ranking (newest first). Plenty for one brokerage. */
const MAX_LISTINGS = 10_000;

export type RankedBroker = Broker & { contactId: string | null };

/** Brokers ranked by the listings this workspace received from them (Phase 4B). */
export async function listBrokers(
  workspaceId: string,
  sort: BrokerSort,
): Promise<{ brokers: RankedBroker[]; listingsRead: number; truncated: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("h4a_listings")
    .select(
      "id, broker_name, broker_company, broker_email, broker_phone, units, price, score, status, deal_id, received_at, zip",
    )
    .eq("workspace_id", workspaceId)
    .order("received_at", { ascending: false })
    .limit(MAX_LISTINGS);
  if (error) throw error;
  const listings = (data ?? []) as BrokerListing[];

  const dealIds = [
    ...new Set(listings.map((l) => l.deal_id).filter((x): x is string => Boolean(x))),
  ];
  const dealStatus = new Map<string, string>();
  for (let i = 0; i < dealIds.length; i += 200) {
    const { data: deals, error: dealError } = await supabase
      .from("deals")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .in("id", dealIds.slice(i, i + 200));
    if (dealError) throw dealError;
    for (const d of deals ?? []) dealStatus.set(d.id, d.status);
  }

  const brokers = rankBrokers(listings, dealStatus, sort);

  // Which brokers are already in People (same email or phone)?
  const emails = [
    ...new Set(
      brokers
        .map((b) => (b.email ? normalizeEmail(b.email) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const phones = [
    ...new Set(
      brokers
        .map((b) => (b.phone ? normalizePhone(b.phone) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data: rows } = await supabase
      .from("contacts")
      .select("id, email_keys")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .overlaps("email_keys", emails.slice(i, i + 200));
    for (const c of rows ?? []) for (const k of c.email_keys ?? []) byEmail.set(k, c.id);
  }
  for (let i = 0; i < phones.length; i += 200) {
    const { data: rows } = await supabase
      .from("contacts")
      .select("id, phone_keys")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .overlaps("phone_keys", phones.slice(i, i + 200));
    for (const c of rows ?? []) for (const k of c.phone_keys ?? []) byPhone.set(k, c.id);
  }

  return {
    brokers: brokers.map((b) => {
      const e = b.email ? normalizeEmail(b.email) : null;
      const p = b.phone ? normalizePhone(b.phone) : null;
      return { ...b, contactId: (e && byEmail.get(e)) || (p && byPhone.get(p)) || null };
    }),
    listingsRead: listings.length,
    truncated: listings.length === MAX_LISTINGS,
  };
}

export type LongHoldOwner = {
  propertyId: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  units: number | null;
  lastSaleDate: string;
  lastSalePrice: number | null;
  yearsHeld: number;
  /** Where the sale date came from (field_sources), e.g. "San Diego County Assessor". */
  saleDateSource: string | null;
  owner:
    | {
        kind: "contact";
        id: string;
        name: string;
        dnc: boolean;
        emailOptOut: boolean;
        smsConsent: string;
        hasPhone: boolean;
        hasEmail: boolean;
      }
    | { kind: "company"; id: string; name: string }
    | null;
};

export type OwnerFilters = { minYears: number; minUnits: number | null; zip: string | null };

/** Properties whose owner has held them at least `minYears` (by last sale date). */
export async function listLongHoldOwners(
  workspaceId: string,
  filters: OwnerFilters,
  today = new Date(),
): Promise<{ owners: LongHoldOwner[]; withoutSaleDate: number; truncated: boolean }> {
  const supabase = await createClient();
  let q = supabase
    .from("properties")
    .select(
      "id, address, city, zip, units, last_sale_date, last_sale_price, field_sources, owner:contacts!properties_workspace_id_owner_contact_id_fkey(id, full_name, dnc, email_opt_out, sms_consent, phone_keys, email_keys), owner_company:companies!properties_workspace_id_owner_company_id_fkey(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("last_sale_date", "is", null)
    .lte("last_sale_date", heldSinceCutoff(filters.minYears, today))
    .order("last_sale_date", { ascending: true })
    .limit(2_000);
  if (filters.minUnits) q = q.gte("units", filters.minUnits);
  if (filters.zip) q = q.eq("zip", filters.zip);
  const [{ data, error }, missing] = await Promise.all([
    q,
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .is("last_sale_date", null),
  ]);
  if (error) throw error;

  const owners: LongHoldOwner[] = (data ?? []).map((p) => {
    const sources = (p.field_sources ?? {}) as Record<string, { source?: string } | undefined>;
    const c = p.owner as unknown as {
      id: string;
      full_name: string | null;
      dnc: boolean;
      email_opt_out: boolean;
      sms_consent: string;
      phone_keys: string[] | null;
      email_keys: string[] | null;
    } | null;
    const co = p.owner_company as unknown as { id: string; name: string } | null;
    return {
      propertyId: p.id,
      address: p.address,
      city: p.city,
      zip: p.zip,
      units: p.units,
      lastSaleDate: p.last_sale_date as string,
      lastSalePrice: p.last_sale_price === null ? null : Number(p.last_sale_price),
      yearsHeld: yearsHeld(p.last_sale_date as string, today),
      saleDateSource: sources.last_sale_date?.source ?? null,
      owner: c
        ? {
            kind: "contact",
            id: c.id,
            name: c.full_name || "Unnamed contact",
            dnc: c.dnc,
            emailOptOut: c.email_opt_out,
            smsConsent: c.sms_consent,
            hasPhone: (c.phone_keys ?? []).length > 0,
            hasEmail: (c.email_keys ?? []).length > 0,
          }
        : co
          ? { kind: "company", id: co.id, name: co.name }
          : null,
    };
  });
  return { owners, withoutSaleDate: missing.count ?? 0, truncated: owners.length === 2_000 };
}
