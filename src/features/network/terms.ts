import type { MemberType } from "./schema";

/**
 * The same community engine serves Housing4All (the "Network", deals) and AZH Builders
 * (the "Community", projects). Every user-facing word that differs lives here.
 */
export type CommunityKind = "real_estate" | "construction";

export type CommunityTerms = {
  /** "Network" / "Community", shown after the workspace name. */
  suffix: string;
  /** Team page path under /w/[slug]/. */
  staffPath: "network" | "community";
  /** The member app's second tab and its post type. */
  dealsLabel: string;
  dealLabel: string;
  shareLabel: string;
  noDeals: string;
  shareHint: string;
  feedEmpty: string;
  joinBlurb: string;
  headlineHelp: string;
  staffBlurb: (workspaceName: string) => string;
  /** Post fields for the "deal"/"project" kind. */
  typeLabel: string;
  typeHelp: string;
  priceLabel: string;
  showUnits: boolean;
  memberTypes: MemberType[];
  defaultMemberType: MemberType;
};

const REAL_ESTATE: CommunityTerms = {
  suffix: "Network",
  staffPath: "network",
  dealsLabel: "Deals",
  dealLabel: "Deal",
  shareLabel: "Share a deal",
  noDeals: "No deals posted yet",
  shareHint: "Share one with “Share a deal”.",
  feedEmpty: "Posts and deals from the community show up here.",
  joinBlurb:
    "A private community for investors and partners: deals, events and the member directory.",
  headlineHelp: "e.g. “Value-add investor, 20–80 units”.",
  staffBlurb: (name) =>
    `The ${name} Network: an invite-only app for investors and partners. Members see posts, deals, events and each other — never your CRM. Each member is linked to a contact here.`,
  typeLabel: "Type",
  typeHelp: "e.g. multifamily",
  priceLabel: "Price ($)",
  showUnits: true,
  memberTypes: ["investor", "broker", "lender", "property_manager", "partner", "other"],
  defaultMemberType: "investor",
};

const CONSTRUCTION: CommunityTerms = {
  suffix: "Community",
  staffPath: "community",
  dealsLabel: "Projects",
  dealLabel: "Project",
  shareLabel: "Post a project",
  noDeals: "No projects posted yet",
  shareHint: "Share one with “Post a project”.",
  feedEmpty: "Posts and projects from the community show up here.",
  joinBlurb:
    "A private community for homeowners, contractors and partners who build with us: projects, events and the member directory.",
  headlineHelp: "e.g. “Framing sub, North County” or “Planning an ADU in 92104”.",
  staffBlurb: (name) =>
    `The ${name} Community: an invite-only app for homeowners, GCs, subcontractors and investors. Members see posts, projects, events and each other — never your CRM. Each member is linked to a contact here.`,
  typeLabel: "Type of work",
  typeHelp: "e.g. ADU, framing, tenant improvement",
  priceLabel: "Budget ($)",
  showUnits: false,
  memberTypes: ["homeowner", "gc", "subcontractor", "investor", "partner", "other"],
  defaultMemberType: "homeowner",
};

export function communityTerms(kind: CommunityKind | string | null | undefined): CommunityTerms {
  return kind === "construction" ? CONSTRUCTION : REAL_ESTATE;
}
