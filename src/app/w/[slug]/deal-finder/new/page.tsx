import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ListingForm } from "@/features/h4a/components/listing-form";
import { getRealEstateContext } from "@/features/h4a/server/context";

export const metadata: Metadata = { title: "Add listing" };

export default async function NewListingPage({ params }: PageProps<"/w/[slug]/deal-finder/new">) {
  const { slug } = await params;
  const { canWrite } = await getRealEstateContext(slug);
  if (!canWrite) redirect(`/w/${slug}/deal-finder`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/w/${slug}/deal-finder`, label: "Deal Finder" }}
        title="Add a listing"
        description="Type in a listing you heard about. It's scored against your buy box as soon as you save."
      />
      <ListingForm />
    </div>
  );
}
