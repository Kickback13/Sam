import { normalizeEmail, normalizePhone } from "@/lib/normalize";

import { DEFAULT_ALERT_THRESHOLD } from "../constants";

/**
 * Phase 4B: prospect lists, computed from data already in the workspace (no scraping,
 * nothing sent). Brokers are ranked by the listings Sam actually received from them;
 * long-hold owners come from each property's last sale date (with its source).
 */

// ---------------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------------

export type BrokerListing = {
  id: string;
  broker_name: string | null;
  broker_company: string | null;
  broker_email: string | null;
  broker_phone: string | null;
  units: number | null;
  price: number | string | null;
  score: number | null;
  status: string;
  deal_id: string | null;
  received_at: string;
  zip: string | null;
};

export type Broker = {
  key: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  listings: number;
  units: number;
  /** Sum of asking prices that were given. */
  volume: number;
  /** Listings scoring at or above the alert threshold (a buy-box fit). */
  matches: number;
  /** Listings turned into a pipeline deal. */
  promoted: number;
  /** Of those deals, how many closed (won). */
  closed: number;
  lastListedAt: string;
  topZips: string[];
};

export const BROKER_SORTS = [
  { value: "listings", label: "Most listings" },
  { value: "matches", label: "Most buy-box matches" },
  { value: "closed", label: "Most closed deals" },
  { value: "volume", label: "Highest volume" },
  { value: "recent", label: "Most recent" },
] as const;
export type BrokerSort = (typeof BROKER_SORTS)[number]["value"];

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t ? t : null;
};
const lower = (s: string | null) => (s ?? "").toLowerCase();

/**
 * One broker = one email, else one phone, else the same name at the same company.
 * Listings with no broker details at all are left out.
 */
export function brokerKey(
  l: Pick<BrokerListing, "broker_name" | "broker_company" | "broker_email" | "broker_phone">,
): string | null {
  const email = l.broker_email ? normalizeEmail(l.broker_email) : null;
  if (email) return `e:${email}`;
  const phone = l.broker_phone ? normalizePhone(l.broker_phone) : null;
  if (phone) return `p:${phone}`;
  const name = clean(l.broker_name);
  if (name) return `n:${lower(name)}|${lower(clean(l.broker_company))}`;
  return null;
}

const toNumber = (v: number | string | null) => {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function rankBrokers(
  listings: BrokerListing[],
  dealStatus: Map<string, string>,
  sort: BrokerSort = "listings",
): Broker[] {
  const byKey = new Map<string, Broker & { zipCounts: Map<string, number> }>();
  for (const l of listings) {
    // Dismissed listings still count: the broker did send them.
    const key = brokerKey(l);
    if (!key) continue;
    let b = byKey.get(key);
    if (!b) {
      b = {
        key,
        name: null,
        company: null,
        email: null,
        phone: null,
        listings: 0,
        units: 0,
        volume: 0,
        matches: 0,
        promoted: 0,
        closed: 0,
        lastListedAt: l.received_at,
        topZips: [],
        zipCounts: new Map(),
      };
      byKey.set(key, b);
    }
    // Contact details: the most recent non-empty value wins.
    const newer = l.received_at >= b.lastListedAt;
    for (const [field, value] of [
      ["name", clean(l.broker_name)],
      ["company", clean(l.broker_company)],
      ["email", clean(l.broker_email)],
      ["phone", clean(l.broker_phone)],
    ] as const)
      if (value && (newer || !b[field])) b[field] = value;
    if (newer) b.lastListedAt = l.received_at;

    b.listings += 1;
    b.units += l.units ?? 0;
    b.volume += toNumber(l.price) ?? 0;
    if (l.score !== null && l.score >= DEFAULT_ALERT_THRESHOLD) b.matches += 1;
    if (l.deal_id) {
      b.promoted += 1;
      if (dealStatus.get(l.deal_id) === "won") b.closed += 1;
    }
    if (l.zip) b.zipCounts.set(l.zip, (b.zipCounts.get(l.zip) ?? 0) + 1);
  }

  const out: Broker[] = [...byKey.values()].map(({ zipCounts, ...b }) => ({
    ...b,
    topZips: [...zipCounts.entries()]
      .sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))
      .slice(0, 3)
      .map(([zip]) => zip),
  }));
  const tie = (a: Broker, b: Broker) =>
    b.listings - a.listings ||
    b.lastListedAt.localeCompare(a.lastListedAt) ||
    a.key.localeCompare(b.key);
  const by: Record<BrokerSort, (a: Broker, b: Broker) => number> = {
    listings: (a, b) => b.listings - a.listings || b.matches - a.matches || tie(a, b),
    matches: (a, b) => b.matches - a.matches || tie(a, b),
    closed: (a, b) => b.closed - a.closed || b.promoted - a.promoted || tie(a, b),
    volume: (a, b) => b.volume - a.volume || tie(a, b),
    recent: (a, b) => b.lastListedAt.localeCompare(a.lastListedAt) || tie(a, b),
  };
  return out.sort(by[sort]);
}

// ---------------------------------------------------------------------------
// Long-hold owners
// ---------------------------------------------------------------------------

export const DEFAULT_MIN_YEARS = 15;

/** Whole years between a sale date (YYYY-MM-DD) and today. */
export function yearsHeld(lastSaleDate: string, today: Date): number {
  const [y, m, d] = lastSaleDate.slice(0, 10).split("-").map(Number);
  let years = today.getUTCFullYear() - y;
  const beforeAnniversary =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/** The latest sale date that still counts as held for `minYears` (for the database filter). */
export function heldSinceCutoff(minYears: number, today: Date): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - minYears, today.getUTCMonth(), today.getUTCDate()),
  );
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Property managers (from People and Companies already in the workspace)
// ---------------------------------------------------------------------------

export type PmCompany = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
};

export type PmContact = {
  id: string;
  name: string;
  companyId: string | null;
  phone: string | null;
  email: string | null;
};

export type PmDeals = { open: number; won: number; total: number };

export type PropertyManager = {
  key: string;
  companyId: string | null;
  name: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  people: { id: string; name: string }[];
  deals: PmDeals;
  /** Latest logged call, note, text or meeting with any of its people. */
  lastContactAt: string | null;
  /** Logged touches in the last 90 days. */
  touches90: number;
};

export const PM_SORTS = [
  { value: "deals", label: "Most deals together" },
  { value: "stale", label: "Longest since we talked" },
  { value: "recent", label: "Talked most recently" },
  { value: "name", label: "Name" },
] as const;
export type PmSort = (typeof PM_SORTS)[number]["value"];

/**
 * One row per property-management company (its people grouped under it), plus one row
 * per property manager who isn't at a company yet.
 */
export function rankPropertyManagers(
  companies: PmCompany[],
  contacts: PmContact[],
  dealsByContact: Map<string, PmDeals>,
  lastTouchByContact: Map<string, string>,
  touches90ByContact: Map<string, number>,
  sort: PmSort,
): PropertyManager[] {
  const rows = new Map<string, PropertyManager>();
  for (const c of companies)
    rows.set(`c:${c.id}`, {
      key: `c:${c.id}`,
      companyId: c.id,
      name: c.name,
      city: c.city,
      phone: c.phone,
      email: c.email,
      people: [],
      deals: { open: 0, won: 0, total: 0 },
      lastContactAt: null,
      touches90: 0,
    });
  for (const p of contacts) {
    const key = p.companyId && rows.has(`c:${p.companyId}`) ? `c:${p.companyId}` : `p:${p.id}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        companyId: null,
        name: p.name,
        city: null,
        phone: p.phone,
        email: p.email,
        people: [],
        deals: { open: 0, won: 0, total: 0 },
        lastContactAt: null,
        touches90: 0,
      };
      rows.set(key, row);
    }
    row.people.push({ id: p.id, name: p.name });
    row.phone ??= p.phone;
    row.email ??= p.email;
    const d = dealsByContact.get(p.id);
    if (d) {
      row.deals.open += d.open;
      row.deals.won += d.won;
      row.deals.total += d.total;
    }
    const last = lastTouchByContact.get(p.id);
    if (last && (!row.lastContactAt || last > row.lastContactAt)) row.lastContactAt = last;
    row.touches90 += touches90ByContact.get(p.id) ?? 0;
  }
  const list = [...rows.values()];
  const byName = (a: PropertyManager, b: PropertyManager) => a.name.localeCompare(b.name);
  const time = (s: string | null) => (s ? Date.parse(s) : 0);
  const cmp: Record<PmSort, (a: PropertyManager, b: PropertyManager) => number> = {
    deals: (a, b) => b.deals.total - a.deals.total || b.deals.won - a.deals.won || byName(a, b),
    stale: (a, b) => time(a.lastContactAt) - time(b.lastContactAt) || byName(a, b),
    recent: (a, b) => time(b.lastContactAt) - time(a.lastContactAt) || byName(a, b),
    name: byName,
  };
  return list.sort(cmp[sort]);
}
