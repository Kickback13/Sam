import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ListingForm } from "@/features/h4a/components/listing-form";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { getListing } from "@/features/h4a/server/queries";

export const metadata: Metadata = { title: "Correct listing" };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function EditListingPage({
  params,
}: PageProps<"/w/[slug]/deal-finder/[id]/edit">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getRealEstateContext(slug);
  if (!canWrite) redirect(`/w/${slug}/deal-finder/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const l = await getListing(workspace.id, id);
  if (!l) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/w/${slug}/deal-finder/${id}`, label: l.address }}
        title="Correct values"
        description="Fix anything the email or file got wrong. Your entries outrank alert emails and CSV rows, and every change is kept in the history."
      />
      <ListingForm
        initial={{
          id: l.id,
          address: l.address,
          city: s(l.city),
          state: s(l.state),
          zip: s(l.zip),
          apn: s(l.apn),
          submarket: s(l.submarket),
          property_type: s(l.property_type),
          price: l.price === null ? "" : String(Number(l.price)),
          units: s(l.units),
          cap_rate: l.cap_rate === null ? "" : String(Number(l.cap_rate)),
          year_built: s(l.year_built),
          building_sqft: s(l.building_sqft),
          lot_sqft: s(l.lot_sqft),
          broker_name: s(l.broker_name),
          broker_company: s(l.broker_company),
          broker_phone: s(l.broker_phone),
          broker_email: s(l.broker_email),
          listing_url: s(l.listing_url),
        }}
      />
    </div>
  );
}
