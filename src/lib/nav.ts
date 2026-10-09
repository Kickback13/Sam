import type { Database } from "@/lib/db/types";

export type BusinessType = Database["public"]["Enums"]["business_type"];

export type IconName =
  | "today"
  | "dealFinder"
  | "alerts"
  | "pipeline"
  | "people"
  | "companies"
  | "properties"
  | "analyze"
  | "outreach"
  | "calendar"
  | "network"
  | "receptionist"
  | "settings"
  | "projects"
  | "requests"
  | "community"
  | "messages"
  | "tasks";

export type CountKey = "contacts" | "companies" | "properties" | "open_deals" | "my_open_tasks";

export type NavItem = {
  key: string;
  label: string;
  /** Path segment under /w/[slug]/ */
  path: string;
  icon: IconName;
  group: string;
  countKey?: CountKey;
  /** Set for modules delivered in a later phase. */
  comingIn?: number;
};

export type ComingSoonModule = {
  key: string;
  title: string;
  phase: number;
  summary: string;
  bullets: string[];
};

const REAL_ESTATE_NAV: NavItem[] = [
  { key: "today", label: "Today", path: "today", icon: "today", group: "Home" },
  {
    key: "tasks",
    label: "My tasks",
    path: "tasks",
    icon: "tasks",
    group: "Home",
    countKey: "my_open_tasks",
  },
  {
    key: "deal-finder",
    label: "Deal Finder",
    path: "deal-finder",
    icon: "dealFinder",
    group: "Find",
    comingIn: 2,
  },
  { key: "alerts", label: "Alerts", path: "alerts", icon: "alerts", group: "Find", comingIn: 2 },
  {
    key: "pipeline",
    label: "Pipeline",
    path: "pipeline",
    icon: "pipeline",
    group: "Work",
    countKey: "open_deals",
  },
  {
    key: "people",
    label: "People",
    path: "people",
    icon: "people",
    group: "Work",
    countKey: "contacts",
  },
  {
    key: "companies",
    label: "Companies",
    path: "companies",
    icon: "companies",
    group: "Work",
    countKey: "companies",
  },
  {
    key: "properties",
    label: "Properties",
    path: "properties",
    icon: "properties",
    group: "Work",
    countKey: "properties",
  },
  {
    key: "analyze",
    label: "Analyze",
    path: "analyze",
    icon: "analyze",
    group: "Work",
    comingIn: 3,
  },
  {
    key: "outreach",
    label: "Outreach",
    path: "outreach",
    icon: "outreach",
    group: "Engage",
    comingIn: 4,
  },
  {
    key: "calendar",
    label: "Calendar",
    path: "calendar",
    icon: "calendar",
    group: "Engage",
    comingIn: 5,
  },
  {
    key: "network",
    label: "Network",
    path: "network",
    icon: "network",
    group: "Engage",
    comingIn: 6,
  },
  {
    key: "receptionist",
    label: "Receptionist",
    path: "receptionist",
    icon: "receptionist",
    group: "Engage",
    comingIn: 7,
  },
  { key: "settings", label: "Settings", path: "settings", icon: "settings", group: "Admin" },
];

const CONSTRUCTION_NAV: NavItem[] = [
  { key: "today", label: "Today", path: "today", icon: "today", group: "Home" },
  {
    key: "tasks",
    label: "My tasks",
    path: "tasks",
    icon: "tasks",
    group: "Home",
    countKey: "my_open_tasks",
  },
  {
    key: "projects",
    label: "Projects",
    path: "pipeline",
    icon: "projects",
    group: "Work",
    countKey: "open_deals",
  },
  {
    key: "people",
    label: "People",
    path: "people",
    icon: "people",
    group: "Work",
    countKey: "contacts",
  },
  {
    key: "companies",
    label: "Companies",
    path: "companies",
    icon: "companies",
    group: "Work",
    countKey: "companies",
  },
  {
    key: "requests",
    label: "Requests",
    path: "requests",
    icon: "requests",
    group: "Work",
    comingIn: 8,
  },
  {
    key: "community",
    label: "Community",
    path: "community",
    icon: "community",
    group: "Engage",
    comingIn: 8,
  },
  {
    key: "messages",
    label: "Messages",
    path: "messages",
    icon: "messages",
    group: "Engage",
    comingIn: 8,
  },
  { key: "settings", label: "Settings", path: "settings", icon: "settings", group: "Admin" },
];

export function navFor(businessType: BusinessType): NavItem[] {
  return businessType === "construction" ? CONSTRUCTION_NAV : REAL_ESTATE_NAV;
}

/** Bottom-bar items on phones (the rest live in the "More" drawer). */
export function mobilePrimaryNav(businessType: BusinessType): NavItem[] {
  const keys =
    businessType === "construction"
      ? ["today", "projects", "people", "tasks"]
      : ["today", "pipeline", "people", "properties"];
  const items = navFor(businessType);
  return keys.map((k) => items.find((i) => i.key === k)!).filter(Boolean);
}

export function groupNav(items: NavItem[]): { group: string; items: NavItem[] }[] {
  const groups: { group: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => g.group === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

/** Labels that change per business: a "deal" is a "project" at AZH Builders. */
export function dealNoun(businessType: BusinessType, plural = false): string {
  if (businessType === "construction") return plural ? "projects" : "project";
  return plural ? "deals" : "deal";
}

const COMING_SOON: Record<string, ComingSoonModule> = {
  "deal-finder": {
    key: "deal-finder",
    title: "Deal Finder",
    phase: 2,
    summary:
      "Every listing that reaches you — your saved-search alert emails, CSV exports and manual entries — filtered through your buy box, scored, and verified against San Diego County records.",
    bullets: [
      "Buy box: units (2–500), price, price/unit, submarkets, property types",
      "Ingestion from alert emails you forward, CSV exports and manual entry — no scraping",
      "County-record verification with source and fetched-at time on every number",
    ],
  },
  alerts: {
    key: "alerts",
    title: "Alerts",
    phase: 2,
    summary:
      "Instant email and SMS alerts to you the moment a verified listing matches your buy box.",
    bullets: [
      "Sent from your own accounts, to you only — nothing goes to contacts",
      "Per-buy-box channels, quiet hours and daily digest",
      "Every alert links back to its sources",
    ],
  },
  analyze: {
    key: "analyze",
    title: "Analyze",
    phase: 3,
    summary:
      "Underwriting in one screen: price/unit, rents, NOI, cap rate, DSCR and cash flow, with comps, red flags and an AI summary that cites every source.",
    bullets: [
      "Ownership, mortgage, foreclosure and tax data from a licensed data API",
      "Comparable sales and rents",
      "PDF export that matches the screen",
    ],
  },
  outreach: {
    key: "outreach",
    title: "Outreach",
    phase: 4,
    summary:
      "Sequences to owners, brokers and property managers — every send passes TCPA consent, STOP opt-out, quiet hours, CAN-SPAM and DNC checks first.",
    bullets: ["Reply inbox", "Calendar booking", "Every touch logged on the contact timeline"],
  },
  calendar: {
    key: "calendar",
    title: "Calendar",
    phase: 5,
    summary: "Your Google Calendar inside the platform, with booking links for owners and brokers.",
    bullets: [
      "Two-way Google Calendar sync",
      "Meetings logged as activities",
      "Booking pages per workspace",
    ],
  },
  network: {
    key: "network",
    title: "Housing4All Network",
    phase: 6,
    summary:
      "A community app for your investors and partners: feed, deal posts, member directory, events and broadcasts.",
    bullets: [
      "Installable on phones (PWA)",
      "Members sync to your CRM",
      "Broadcasts respect opt-outs",
    ],
  },
  receptionist: {
    key: "receptionist",
    title: "AI Receptionist",
    phase: 7,
    summary:
      "Answers after 3 rings in English or Spanish, routes callers to you, Vianney or property management, and logs transcripts here.",
    bullets: [
      "ElevenLabs voice + Twilio numbers",
      "Call summaries on the contact timeline",
      "Routing rules per office",
    ],
  },
  requests: {
    key: "requests",
    title: "Homeowner Requests",
    phase: 8,
    summary:
      "An embeddable request form for your website that routes each job to the San Diego or Fallbrook office and books the estimate.",
    bullets: [
      "Creates the contact and a Lead in Projects",
      "Office routing by ZIP code",
      "Estimate booking",
    ],
  },
  community: {
    key: "community",
    title: "AZH Community",
    phase: 8,
    summary:
      "A community for investors and GCs who build with AZH, built on the Housing4All Network engine.",
    bullets: ["Feed and project posts", "Member directory", "Events and broadcasts"],
  },
  messages: {
    key: "messages",
    title: "Messages",
    phase: 8,
    summary: "One inbox for SMS and email with homeowners, GCs and subs, synced with GoHighLevel.",
    bullets: [
      "Conversations from GHL (Phase 5 sync)",
      "Templates per job stage",
      "Compliance-gated sending",
    ],
  },
};

export function comingSoonModule(key: string, businessType: BusinessType): ComingSoonModule | null {
  const allowed = navFor(businessType).some((item) => item.path === key && item.comingIn);
  return allowed ? (COMING_SOON[key] ?? null) : null;
}
