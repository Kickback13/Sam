import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { getProperty } from "@/server/queries/properties";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Edit property" };

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default async function EditPropertyPage({ params }: PageProps<"/w/[slug]/properties/[id]/edit">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/properties/${id}`);
  const p = await getProperty(workspace.id, id);
  if (!p || p.deleted_at) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${p.name ?? p.address}`} back={{ href: `/w/${slug}/properties/${id}`, label: "Back to property" }} />
      <PropertyForm
        initial={{
          id: p.id,
          name: s(p.name),
          address: p.address,
          city: s(p.city),
          state: p.state,
          zip: s(p.zip),
          county: p.county,
          apn: s(p.apn),
          lat: s(p.lat),
          lng: s(p.lng),
          property_type: s(p.property_type),
          units: s(p.units),
          buildings: s(p.buildings),
          building_sqft: s(p.building_sqft),
          lot_sqft: s(p.lot_sqft),
          year_built: s(p.year_built),
          zoning: s(p.zoning),
          submarket: s(p.submarket),
          last_sale_date: s(p.last_sale_date),
          last_sale_price: s(p.last_sale_price),
          assessed_value: s(p.assessed_value),
          notes: s(p.notes),
          tags: p.tags,
          owner: p.owner ? { id: p.owner.id, label: p.owner.full_name ?? "Owner" } : null,
          ownerCompany: p.owner_company ? { id: p.owner_company.id, label: p.owner_company.name } : null,
        }}
      />
    </div>
  );
}
