import "server-only";

import { parseBrand } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

import { buildEstimatePdf } from "../pdf/estimate-pdf";
import { getAzhSettings, getEstimateWithItems, getProject, getProjectDeal } from "./queries";

const notFound = () => new Response("Not found", { status: 404 });

export async function estimatePdfResponse(slug: string, dealId: string, estimateId: string) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in to download estimates.", { status: 401 });

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug, business_type, is_demo, brand, profile")
    .eq("slug", slug)
    .maybeSingle();
  if (!ws || ws.business_type !== "construction") return notFound();

  const [deal, project, data, settings] = await Promise.all([
    getProjectDeal(ws.id, dealId),
    getProject(ws.id, dealId),
    getEstimateWithItems(ws.id, estimateId),
    getAzhSettings(ws.id),
  ]);
  if (!deal || !data || data.estimate.deal_id !== dealId) return notFound();

  let client: { name: string; phone: string | null; email: string | null } | null = null;
  if (deal.contact) {
    const { data: c } = await supabase
      .from("contacts")
      .select("full_name, phones, emails")
      .eq("workspace_id", ws.id)
      .eq("id", deal.contact.id)
      .maybeSingle();
    const first = (list: unknown) =>
      Array.isArray(list) && list[0] && typeof list[0] === "object" && "value" in list[0]
        ? String((list[0] as { value: unknown }).value)
        : null;
    if (c)
      client = {
        name: c.full_name ?? deal.contact.name,
        phone: first(c.phones),
        email: first(c.emails),
      };
  }

  const brand = parseBrand(ws.brand);
  const profile = (ws.profile ?? {}) as Record<string, unknown>;
  const e = data.estimate;
  const bytes = await buildEstimatePdf({
    companyName: typeof profile.legal_name === "string" ? profile.legal_name : ws.name,
    logoText: brand.logoText ?? "AZH",
    accentHex: brand.accent,
    cslbLicense: settings?.cslb_license ?? null,
    isDemo: ws.is_demo,
    estimate: {
      version: e.version,
      title: e.title,
      status: e.status,
      createdAt: e.created_at,
      validUntil: e.valid_until,
      markupPct: Number(e.markup_pct),
      taxPct: Number(e.tax_pct),
      subtotal: Number(e.subtotal),
      markup: Number(e.markup_amount),
      tax: Number(e.tax_amount),
      total: Number(e.total),
      notes: e.notes,
    },
    project: {
      title: deal.title,
      jobAddress: project?.job_address
        ? `${project.job_address}${project.job_zip ? ` ${project.job_zip}` : ""}`
        : null,
    },
    client,
    items: data.items.map((i) => ({
      description: i.description,
      qty: Number(i.qty),
      unit: i.unit,
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
  });

  const filename = `estimate-v${e.version}-${
    deal.title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  }.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
