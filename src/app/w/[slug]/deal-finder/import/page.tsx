import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ListingImportWizard } from "@/features/h4a/components/listing-import-wizard";
import { getRealEstateContext } from "@/features/h4a/server/context";

export const metadata: Metadata = { title: "Upload listings" };

export default async function ListingImportPage({
  params,
}: PageProps<"/w/[slug]/deal-finder/import">) {
  const { slug } = await params;
  const { canWrite } = await getRealEstateContext(slug);
  if (!canWrite) redirect(`/w/${slug}/deal-finder`);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: `/w/${slug}/deal-finder`, label: "Deal Finder" }}
        title="Upload listings (CSV)"
        description="Bring in listings from your own exports. Each row is checked, deduped against Deal Finder and scored."
      />
      <ListingImportWizard />
    </div>
  );
}
