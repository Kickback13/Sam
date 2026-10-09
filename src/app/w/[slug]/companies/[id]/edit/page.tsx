import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/common/page-header";
import { getCompany } from "@/server/queries/companies";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Edit company" };

export default async function EditCompanyPage({
  params,
}: PageProps<"/w/[slug]/companies/[id]/edit">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/companies/${id}`);
  const c = await getCompany(workspace.id, id);
  if (!c || c.deleted_at) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${c.name}`}
        back={{ href: `/w/${slug}/companies/${id}`, label: "Back to company" }}
      />
      <CompanyForm initial={{ ...c, email: c.email ?? null }} />
    </div>
  );
}
