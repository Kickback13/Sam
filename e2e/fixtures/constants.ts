type StageSeed = { name: string; color: string; isWon?: boolean; isLost?: boolean };

export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const AZH_LIKE_BRAND = {
  primary: "#111110",
  primaryDeep: "#1C1C1A",
  accent: "#FFC20E",
  accentText: "#8A6400",
  danger: "#D62718",
  ink: "#111110",
  surface: "#F3F3F0",
  displayFont: "big-shoulders-display",
  bodyFont: "barlow",
  logoText: "E2E",
};

const H4A_LIKE_BRAND = {
  primary: "#2F439A",
  primaryDeep: "#202F8B",
  accent: "#00D9E1",
  accentText: "#007B82",
  danger: "#B42318",
  ink: "#0B0C10",
  surface: "#E8FBFC",
  displayFont: "plus-jakarta-sans",
  bodyFont: "source-sans-3",
  logoText: "E2E",
};

export const E2E_WORKSPACES: {
  slug: string;
  name: string;
  businessType: "real_estate" | "construction";
  brand: Record<string, string>;
  pipeline: { name: string; kind: string; stages: StageSeed[] };
}[] = [
  {
    slug: "e2e-realty",
    name: "E2E Realty (test)",
    businessType: "real_estate",
    brand: H4A_LIKE_BRAND,
    pipeline: {
      name: "Acquisitions",
      kind: "acquisition",
      stages: [
        { name: "New Deal", color: "#64748B" },
        { name: "Qualified", color: "#0EA5E9" },
        { name: "Contacted", color: "#6366F1" },
        { name: "Interested", color: "#8B5CF6" },
        { name: "Underwriting", color: "#F59E0B" },
        { name: "Offer", color: "#F97316" },
        { name: "Closed", color: "#16A34A", isWon: true },
        { name: "Lost", color: "#DC2626", isLost: true },
      ],
    },
  },
  {
    slug: "e2e-builders",
    name: "E2E Builders (test)",
    businessType: "construction",
    brand: AZH_LIKE_BRAND,
    pipeline: {
      name: "Projects",
      kind: "construction_project",
      stages: [
        { name: "Lead", color: "#64748B" },
        { name: "Estimate", color: "#0EA5E9" },
        { name: "Bid Sent", color: "#6366F1" },
        { name: "Won", color: "#16A34A", isWon: true },
        { name: "In Progress", color: "#F59E0B", isWon: true },
        { name: "Complete", color: "#0D9488", isWon: true },
        { name: "Review", color: "#8B5CF6", isWon: true },
        { name: "Lost", color: "#DC2626", isLost: true },
      ],
    },
  },
];

export const E2E_USERS = [
  {
    id: "e2e00000-0000-4000-a000-000000000001",
    email: "e2e-admin@example.test",
    name: "Erin Tester",
    memberships: [
      { slug: "e2e-realty", role: "owner" },
      { slug: "e2e-builders", role: "admin" },
    ],
  },
  {
    id: "e2e00000-0000-4000-a000-000000000002",
    email: "e2e-outsider@example.test",
    name: "Oscar Outsider",
    memberships: [{ slug: "e2e-builders", role: "agent" }],
  },
] as const;
