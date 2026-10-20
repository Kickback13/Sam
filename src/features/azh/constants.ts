/** AZH Builders (construction) constants shared by server and client code. */

export const OFFICES = [
  {
    value: "san_diego",
    label: "San Diego",
    address: "3683 University Ave, San Diego, CA 92104",
    phone: "(619) 202-0679",
  },
  {
    value: "fallbrook",
    label: "Fallbrook",
    address: "532 E. Fallbrook Ave, Fallbrook, CA",
    phone: "(760) 691-5000",
  },
] as const;
export type Office = (typeof OFFICES)[number]["value"];
export const OFFICE_VALUES = OFFICES.map((o) => o.value) as [Office, ...Office[]];

export function officeLabel(office: string | null | undefined): string {
  return OFFICES.find((o) => o.value === office)?.label ?? "—";
}

export const REQUEST_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "estimate_scheduled", label: "Estimate scheduled" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];
export const REQUEST_STATUS_VALUES = REQUEST_STATUSES.map((s) => s.value) as [
  RequestStatus,
  ...RequestStatus[],
];

export const ESTIMATE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]["value"];
export const ESTIMATE_STATUS_VALUES = ESTIMATE_STATUSES.map((s) => s.value) as [
  EstimateStatus,
  ...EstimateStatus[],
];

export const CONTACT_TIMES = ["morning", "afternoon", "evening", "any"] as const;
export type ContactTime = (typeof CONTACT_TIMES)[number];

export const MILESTONE_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "delayed", label: "Delayed" },
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]["value"];
export const MILESTONE_STATUS_VALUES = MILESTONE_STATUSES.map((s) => s.value) as [
  MilestoneStatus,
  ...MilestoneStatus[],
];

export const CHANGE_ORDER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number]["value"];
export const CHANGE_ORDER_STATUS_VALUES = CHANGE_ORDER_STATUSES.map((s) => s.value) as [
  ChangeOrderStatus,
  ...ChangeOrderStatus[],
];

export const VISIT_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number]["value"];
export const VISIT_STATUS_VALUES = VISIT_STATUSES.map((s) => s.value) as [
  VisitStatus,
  ...VisitStatus[],
];

/** Shown on documents when Settings → AZH has no CSLB number. Never invent one. */
export const LICENSE_PENDING = "License # pending";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_INTAKE_PHOTOS = 5;

export const INTAKE_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** File-type allow-list for project/request files (mirrors the azh-files bucket). */
export const FILE_TYPES: Record<string, "photo" | "document"> = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/webp": "photo",
  "image/gif": "photo",
  "image/heic": "photo",
  "image/heif": "photo",
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "text/plain": "document",
  "text/csv": "document",
};
