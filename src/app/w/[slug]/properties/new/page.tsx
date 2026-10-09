import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "New property" };

export default async function NewPropertyPage({ params }: PageProps<"/w/[slug]/properties/new">) {
  const { slug } = await params;
  const { canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/properties`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New property" back={{ href: `/w/${slug}/properties`, label: "Properties" }} />
      <PropertyForm />
    </div>
  );
}
