import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/common/page-header";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "New company" };

export default async function NewCompanyPage({ params }: PageProps<"/w/[slug]/companies/new">) {
  const { slug } = await params;
  const { canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/companies`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New company" back={{ href: `/w/${slug}/companies`, label: "Companies" }} />
      <CompanyForm />
    </div>
  );
}
