/**
 * AZH communication hub (module 16, AZH-017): one timeline per contact.
 *
 * Merges what the app already records — calls and notes (activities), homeowner requests,
 * estimate visits, estimates and projects — into one list, newest first. Nothing here is
 * stored twice: every entry points back at the record it came from. Pure functions so the
 * merge rules are unit-tested.
 */

import { ESTIMATE_STATUSES, officeLabel, REQUEST_STATUSES, VISIT_STATUSES } from "../constants";

export type HubKind = "request" | "visit" | "estimate" | "project";

export type HubEvent = {
  id: string;
  kind: HubKind;
  /** Sort key: an ISO timestamp (date-only fields sort at noon UTC of that day). */
  at: string;
  /** True when the source field is a calendar date with no time of day. */
  dateOnly: boolean;
  title: string;
  detail: string | null;
  /** App path under /w/{slug}/ for the source record. */
  path: string;
};

export type HubRequest = {
  id: string;
  status: string;
  office: string;
  service_type: string | null;
  description: string | null;
  job_address: string | null;
  source: string;
  submitted_at: string;
  contacted_at: string | null;
  converted_at: string | null;
  closed_at: string | null;
};

export type HubVisit = {
  id: string;
  status: string;
  starts_at: string;
  office: string;
  address: string | null;
  notes: string | null;
  estimatorName: string | null;
};

export type HubEstimate = {
  id: string;
  deal_id: string;
  version: number;
  title: string;
  status: string;
  total: number;
  created_at: string;
  sent_on: string | null;
  accepted_on: string | null;
  declined_on: string | null;
  dealTitle: string;
};

export type HubProject = {
  deal_id: string;
  dealTitle: string;
  created_at: string;
  start_on: string | null;
  completed_on: string | null;
  job_address: string | null;
};

const label = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((x) => x.value === v)?.label ?? v;

const day = (d: string) => `${d.slice(0, 10)}T12:00:00.000Z`;

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" · ") || null;

const clip = (s: string | null | undefined, n = 280) =>
  s && s.trim() ? (s.trim().length > n ? `${s.trim().slice(0, n - 1)}…` : s.trim()) : null;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function requestEvents(r: HubRequest): HubEvent[] {
  const path = `requests?request=${r.id}`;
  const service = r.service_type ? r.service_type : "Service request";
  const out: HubEvent[] = [
    {
      id: `request:${r.id}:submitted`,
      kind: "request",
      at: r.submitted_at,
      dateOnly: false,
      title: `Request received — ${service}`,
      detail: join(
        officeLabel(r.office) + " office",
        r.job_address,
        r.source === "web_form" ? "Website form" : r.source,
        clip(r.description),
      ),
      path,
    },
  ];
  if (r.contacted_at)
    out.push({
      id: `request:${r.id}:contacted`,
      kind: "request",
      at: r.contacted_at,
      dateOnly: false,
      title: "Request marked contacted",
      detail: service,
      path,
    });
  if (r.converted_at)
    out.push({
      id: `request:${r.id}:converted`,
      kind: "request",
      at: r.converted_at,
      dateOnly: false,
      title: "Request converted to a project",
      detail: service,
      path,
    });
  if (r.closed_at)
    out.push({
      id: `request:${r.id}:closed`,
      kind: "request",
      at: r.closed_at,
      dateOnly: false,
      title: "Request closed",
      detail: join(service, label(REQUEST_STATUSES, r.status)),
      path,
    });
  return out;
}

export function visitEvent(v: HubVisit): HubEvent {
  return {
    id: `visit:${v.id}`,
    kind: "visit",
    at: v.starts_at,
    dateOnly: false,
    title: `Estimate visit — ${label(VISIT_STATUSES, v.status).toLowerCase()}`,
    detail: join(
      officeLabel(v.office) + " office",
      v.address,
      v.estimatorName ? `Estimator: ${v.estimatorName}` : null,
      clip(v.notes),
    ),
    path: "schedule",
  };
}

export function estimateEvents(e: HubEstimate): HubEvent[] {
  const path = `projects/${e.deal_id}/estimates`;
  const name = `${e.title} v${e.version}`;
  const base = { kind: "estimate" as const, path };
  const out: HubEvent[] = [
    {
      ...base,
      id: `estimate:${e.id}:created`,
      at: e.created_at,
      dateOnly: false,
      title: `Estimate created — ${name}`,
      detail: join(e.dealTitle, money(e.total), label(ESTIMATE_STATUSES, e.status)),
    },
  ];
  const dated: [string | null, string][] = [
    [e.sent_on, "sent"],
    [e.accepted_on, "accepted"],
    [e.declined_on, "declined"],
  ];
  for (const [d, what] of dated)
    if (d)
      out.push({
        ...base,
        id: `estimate:${e.id}:${what}`,
        at: day(d),
        dateOnly: true,
        title: `Estimate ${what} — ${name}`,
        detail: join(e.dealTitle, money(e.total)),
      });
  return out;
}

export function projectEvents(p: HubProject): HubEvent[] {
  const path = `projects/${p.deal_id}`;
  const out: HubEvent[] = [
    {
      id: `project:${p.deal_id}:created`,
      kind: "project",
      at: p.created_at,
      dateOnly: false,
      title: `Project opened — ${p.dealTitle}`,
      detail: clip(p.job_address),
      path,
    },
  ];
  if (p.start_on)
    out.push({
      id: `project:${p.deal_id}:start`,
      kind: "project",
      at: day(p.start_on),
      dateOnly: true,
      title: `Work starts — ${p.dealTitle}`,
      detail: null,
      path,
    });
  if (p.completed_on)
    out.push({
      id: `project:${p.deal_id}:completed`,
      kind: "project",
      at: day(p.completed_on),
      dateOnly: true,
      title: `Project complete — ${p.dealTitle}`,
      detail: null,
      path,
    });
  return out;
}

export type HubFilter = "all" | "calls" | "notes" | HubKind;

export const HUB_FILTERS: { value: HubFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "calls", label: "Calls" },
  { value: "notes", label: "Notes" },
  { value: "request", label: "Requests" },
  { value: "visit", label: "Visits" },
  { value: "estimate", label: "Estimates" },
  { value: "project", label: "Projects" },
];

/** A hub entry: an activity (call, note, email log, stage change…) or a record event. */
export type HubEntry<A extends { id: string; type: string; occurredAt: string }> =
  | { source: "activity"; at: string; activity: A }
  | { source: "event"; at: string; event: HubEvent };

export function mergeHub<A extends { id: string; type: string; occurredAt: string }>(
  activities: A[],
  events: HubEvent[],
): HubEntry<A>[] {
  const seen = new Set<string>();
  const out: HubEntry<A>[] = [];
  for (const a of activities) {
    if (seen.has(`a:${a.id}`)) continue;
    seen.add(`a:${a.id}`);
    out.push({ source: "activity", at: a.occurredAt, activity: a });
  }
  for (const e of events) {
    if (seen.has(`e:${e.id}`)) continue;
    seen.add(`e:${e.id}`);
    out.push({ source: "event", at: e.at, event: e });
  }
  return out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

export function matchesFilter<A extends { type: string }>(
  entry: { source: "activity"; activity: A } | { source: "event"; event: HubEvent },
  filter: HubFilter,
): boolean {
  if (filter === "all") return true;
  if (entry.source === "activity") {
    if (filter === "calls") return entry.activity.type === "call";
    if (filter === "notes") return entry.activity.type === "note";
    return false;
  }
  return entry.event.kind === filter;
}
