import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, type WorkspaceContext } from "@/server/workspace";

import type { Office } from "../constants";

type Tables = Database["public"]["Tables"];
export type ProjectRow = Tables["azh_projects"]["Row"];
export type EstimateRow = Tables["azh_estimates"]["Row"];
export type EstimateItemRow = Tables["azh_estimate_items"]["Row"];
export type SettingsRow = Tables["azh_settings"]["Row"];
export type FileRow = Tables["azh_files"]["Row"];
export type MilestoneRow = Tables["azh_milestones"]["Row"];
export type BudgetLineRow = Tables["azh_budget_lines"]["Row"];
export type CostRow = Tables["azh_costs"]["Row"];
export type ChangeOrderRow = Tables["azh_change_orders"]["Row"];

/** Workspace context for AZH-only routes: 404 for real-estate workspaces. */
export async function requireConstruction(slug: string): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext(slug);
  if (ctx.workspace.businessType !== "construction") notFound();
  return ctx;
}

const personName = (p: { full_name: string | null; email: string | null } | null | undefined) =>
  p ? p.full_name?.trim() || p.email?.split("@")[0] || "Member" : null;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const getAzhSettings = cache(async (workspaceId: string): Promise<SettingsRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export async function getZipRoutes(
  workspaceId: string,
): Promise<{ zip: string; office: Office }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_zip_routes")
    .select("zip, office")
    .eq("workspace_id", workspaceId)
    .order("zip");
  if (error) throw error;
  return (data ?? []) as { zip: string; office: Office }[];
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export type ProjectDeal = {
  id: string;
  title: string;
  value: number | null;
  status: "open" | "won" | "lost";
  stageId: string;
  stageName: string;
  stageColor: string;
  pipelineId: string;
  createdAt: string;
  contact: { id: string; name: string } | null;
  property: { id: string; label: string } | null;
};

export async function getProjectDeal(
  workspaceId: string,
  dealId: string,
): Promise<ProjectDeal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, title, value, status, stage_id, pipeline_id, created_at, deleted_at, stage:pipeline_stages!deals_pipeline_id_stage_id_fkey(name, color), pipeline:pipelines!deals_workspace_id_pipeline_id_fkey(kind), contact:contacts!deals_workspace_id_primary_contact_id_fkey(id, full_name), property:properties!deals_workspace_id_property_id_fkey(id, name, address)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at || data.pipeline?.kind !== "construction_project") return null;
  return {
    id: data.id,
    title: data.title,
    value: data.value,
    status: data.status,
    stageId: data.stage_id,
    stageName: data.stage?.name ?? "—",
    stageColor: data.stage?.color ?? "#64748B",
    pipelineId: data.pipeline_id,
    createdAt: data.created_at,
    contact: data.contact
      ? { id: data.contact.id, name: data.contact.full_name ?? "Unnamed contact" }
      : null,
    property: data.property
      ? { id: data.property.id, label: data.property.name ?? data.property.address }
      : null,
  };
}

export async function getProject(workspaceId: string, dealId: string): Promise<ProjectRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type CardExtra = { office: Office | null; services: string[]; value: number | null };

/** Office + services + contract value for every project card on a board. */
export async function getCardExtras(
  workspaceId: string,
  pipelineId: string,
): Promise<Record<string, CardExtra>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_projects")
    .select("deal_id, office, service_types, contract_value, deal:deals!inner(pipeline_id)")
    .eq("workspace_id", workspaceId)
    .eq("deal.pipeline_id", pipelineId)
    .limit(2000);
  if (error) throw error;
  const out: Record<string, CardExtra> = {};
  for (const p of data ?? [])
    out[p.deal_id] = {
      office: p.office as Office | null,
      services: p.service_types,
      value: p.contract_value,
    };
  return out;
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------
export async function getEstimates(workspaceId: string, dealId: string): Promise<EstimateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_estimates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getEstimateWithItems(
  workspaceId: string,
  estimateId: string,
): Promise<{ estimate: EstimateRow; items: EstimateItemRow[] } | null> {
  const supabase = await createClient();
  const [{ data: estimate, error }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("azh_estimates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", estimateId)
      .maybeSingle(),
    supabase
      .from("azh_estimate_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("estimate_id", estimateId)
      .order("position"),
  ]);
  if (error) throw error;
  if (itemsError) throw itemsError;
  if (!estimate) return null;
  return { estimate, items: items ?? [] };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export type RequestListItem = {
  id: string;
  status: string;
  office: Office;
  serviceType: string | null;
  description: string | null;
  jobAddress: string | null;
  jobZip: string | null;
  preferredContactTime: string | null;
  language: "en" | "es";
  photoPaths: string[];
  smsConsent: boolean;
  smsConsentAt: string | null;
  smsConsentText: string | null;
  submittedAt: string;
  source: string;
  dealId: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
};

export type RequestFilters = { office?: string; service?: string; status?: string; q?: string };

const REQUEST_SELECT =
  "id, status, office, service_type, description, job_address, job_zip, preferred_contact_time, language, photo_paths, sms_consent, sms_consent_at, sms_consent_text, submitted_at, source, deal_id, assigned_to, assignee:profiles!azh_requests_assigned_to_fkey(full_name, email), contact:contacts!azh_requests_workspace_id_contact_id_fkey(id, full_name, phones, emails)";

type RequestQueryRow = {
  id: string;
  status: string;
  office: string;
  service_type: string | null;
  description: string | null;
  job_address: string | null;
  job_zip: string | null;
  preferred_contact_time: string | null;
  language: string;
  photo_paths: string[];
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_text: string | null;
  submitted_at: string;
  source: string;
  deal_id: string | null;
  assigned_to: string | null;
  assignee: { full_name: string | null; email: string | null } | null;
  contact: { id: string; full_name: string | null; phones: unknown; emails: unknown } | null;
};

const firstValue = (list: unknown): string | null =>
  Array.isArray(list) && list[0] && typeof list[0] === "object" && "value" in list[0]
    ? String((list[0] as { value: unknown }).value)
    : null;

function toRequest(r: RequestQueryRow): RequestListItem {
  return {
    id: r.id,
    status: r.status,
    office: r.office as Office,
    serviceType: r.service_type,
    description: r.description,
    jobAddress: r.job_address,
    jobZip: r.job_zip,
    preferredContactTime: r.preferred_contact_time,
    language: r.language === "es" ? "es" : "en",
    photoPaths: r.photo_paths,
    smsConsent: r.sms_consent,
    smsConsentAt: r.sms_consent_at,
    smsConsentText: r.sms_consent_text,
    submittedAt: r.submitted_at,
    source: r.source,
    dealId: r.deal_id,
    assignedTo: r.assigned_to,
    assigneeName: personName(r.assignee),
    contact: r.contact
      ? {
          id: r.contact.id,
          name: r.contact.full_name ?? "Unnamed contact",
          phone: firstValue(r.contact.phones),
          email: firstValue(r.contact.emails),
        }
      : null,
  };
}

export async function getRequests(
  workspaceId: string,
  filters: RequestFilters = {},
): Promise<RequestListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("azh_requests")
    .select(REQUEST_SELECT)
    .eq("workspace_id", workspaceId)
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (filters.office) q = q.eq("office", filters.office);
  if (filters.service) q = q.eq("service_type", filters.service);
  if (filters.status) q = q.eq("status", filters.status);
  const term = filters.q
    ?.trim()
    .replace(/[%_,()\\]/g, " ")
    .slice(0, 100);
  if (term)
    q = q.or(
      `job_address.ilike.%${term}%,description.ilike.%${term}%,service_type.ilike.%${term}%,job_zip.ilike.%${term}%`,
    );
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as RequestQueryRow[]).map(toRequest);
}

export async function getRequest(
  workspaceId: string,
  requestId: string,
): Promise<RequestListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_requests")
    .select(REQUEST_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRequest(data as unknown as RequestQueryRow) : null;
}

/** Short-lived signed URLs for private objects (members only, via RLS). */
export async function signedUrls(
  bucket: "azh-intake" | "azh-files",
  paths: string[],
  expiresIn = 600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) {
    console.error("createSignedUrls failed", { bucket, message: error.message });
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export type FileItem = FileRow & { url: string | null; uploaderName: string | null };

export async function getFiles(
  workspaceId: string,
  parent: { dealId?: string; requestId?: string },
): Promise<FileItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("azh_files")
    .select("*, uploader:profiles!azh_files_uploaded_by_fkey(full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (parent.dealId) q = q.eq("deal_id", parent.dealId);
  if (parent.requestId) q = q.eq("request_id", parent.requestId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const urls = await signedUrls(
    "azh-files",
    rows.map((r) => r.path),
  );
  return rows.map(({ uploader, ...r }) => ({
    ...r,
    url: urls[r.path] ?? null,
    uploaderName: personName(uploader),
  }));
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------
export type VisitItem = {
  id: string;
  startsAt: string;
  endsAt: string;
  office: Office;
  estimatorId: string | null;
  estimatorName: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  requestId: string | null;
  dealId: string | null;
  label: string;
};

export async function getVisits(
  workspaceId: string,
  range: { from: string; to: string } | { dealId?: string; requestId?: string },
): Promise<VisitItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("azh_visits")
    .select(
      "id, starts_at, ends_at, office, estimator_id, address, notes, status, request_id, deal_id, estimator:profiles!azh_visits_estimator_id_fkey(full_name, email), deal:deals!azh_visits_workspace_id_deal_id_fkey(title), request:azh_requests!azh_visits_workspace_id_request_id_fkey(service_type, contact:contacts!azh_requests_workspace_id_contact_id_fkey(full_name))",
    )
    .eq("workspace_id", workspaceId)
    .order("starts_at")
    .limit(1000);
  if ("from" in range) q = q.gte("starts_at", range.from).lt("starts_at", range.to);
  else {
    if (range.dealId) q = q.eq("deal_id", range.dealId);
    if (range.requestId) q = q.eq("request_id", range.requestId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id,
    startsAt: v.starts_at,
    endsAt: v.ends_at,
    office: v.office as Office,
    estimatorId: v.estimator_id,
    estimatorName: personName(v.estimator),
    address: v.address,
    notes: v.notes,
    status: v.status,
    requestId: v.request_id,
    dealId: v.deal_id,
    label:
      v.deal?.title ??
      ([v.request?.service_type, v.request?.contact?.full_name].filter(Boolean).join(" — ") ||
        "Estimate visit"),
  }));
}

// ---------------------------------------------------------------------------
// Schedule + budget
// ---------------------------------------------------------------------------
export async function getMilestones(workspaceId: string, dealId: string): Promise<MilestoneRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_milestones")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .order("planned_on", { ascending: true, nullsFirst: false })
    .order("position");
  if (error) throw error;
  return data ?? [];
}

export type UpcomingMilestone = MilestoneRow & { dealTitle: string };

export async function getUpcomingMilestones(
  workspaceId: string,
  limit = 20,
): Promise<UpcomingMilestone[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("azh_milestones")
    .select("*, deal:deals!azh_milestones_workspace_id_deal_id_fkey(title, deleted_at)")
    .eq("workspace_id", workspaceId)
    .neq("status", "done")
    .not("planned_on", "is", null)
    .order("planned_on")
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => !m.deal?.deleted_at)
    .map(({ deal, ...m }) => ({ ...m, dealTitle: deal?.title ?? "Project" }));
}

export async function getBudget(workspaceId: string, dealId: string) {
  const supabase = await createClient();
  const [lines, costs, orders] = await Promise.all([
    supabase
      .from("azh_budget_lines")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("deal_id", dealId)
      .order("position")
      .order("created_at"),
    supabase
      .from("azh_costs")
      .select("*, receipt:azh_files!azh_costs_workspace_id_receipt_file_id_fkey(id, name, path)")
      .eq("workspace_id", workspaceId)
      .eq("deal_id", dealId)
      .order("spent_on", { ascending: false }),
    supabase
      .from("azh_change_orders")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("deal_id", dealId)
      .order("number"),
  ]);
  if (lines.error) throw lines.error;
  if (costs.error) throw costs.error;
  if (orders.error) throw orders.error;
  return { lines: lines.data ?? [], costs: costs.data ?? [], orders: orders.data ?? [] };
}
export type BudgetData = Awaited<ReturnType<typeof getBudget>>;
