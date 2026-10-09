export const APP_NAME = "Housing4All Platform";

/** Display timezone. Both businesses operate in San Diego County. */
export const APP_TIMEZONE = "America/Los_Angeles";

export const CONTACT_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "broker", label: "Broker" },
  { value: "property_manager", label: "Property manager" },
  { value: "investor", label: "Investor" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "lender", label: "Lender" },
  { value: "gc", label: "General contractor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "homeowner", label: "Homeowner" },
  { value: "tenant", label: "Tenant" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number]["value"];
export const CONTACT_ROLE_VALUES = CONTACT_ROLES.map((r) => r.value) as [ContactRole, ...ContactRole[]];

export const COMPANY_TYPES = [
  { value: "brokerage", label: "Brokerage" },
  { value: "property_management", label: "Property management" },
  { value: "lender", label: "Lender" },
  { value: "investor", label: "Investor" },
  { value: "developer", label: "Developer" },
  { value: "gc", label: "General contractor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "supplier", label: "Supplier" },
  { value: "vendor", label: "Vendor" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number]["value"];
export const COMPANY_TYPE_VALUES = COMPANY_TYPES.map((r) => r.value) as [CompanyType, ...CompanyType[]];

export const PROPERTY_TYPES = [
  { value: "multifamily", label: "Multifamily" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "fourplex", label: "Fourplex" },
  { value: "mixed_use", label: "Mixed use" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];
export const PROPERTY_TYPE_VALUES = PROPERTY_TYPES.map((r) => r.value) as [PropertyType, ...PropertyType[]];

export const SMS_CONSENT_LABELS = {
  none: "No SMS consent",
  express: "Express consent",
  written: "Written consent",
} as const;

export const ACTIVITY_LABELS = {
  note: "Note",
  call: "Call",
  email: "Email",
  sms: "SMS",
  meeting: "Meeting",
  stage_change: "Stage change",
  system: "System",
} as const;

export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
} as const;

export function labelFor<T extends readonly { value: string; label: string }[]>(
  list: T,
  value: string | null | undefined,
): string {
  if (!value) return "";
  return list.find((item) => item.value === value)?.label ?? value;
}
