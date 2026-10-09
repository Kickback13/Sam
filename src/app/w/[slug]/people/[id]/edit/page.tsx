import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ContactForm } from "@/components/people/contact-form";
import { contactDisplayName, getContact } from "@/server/queries/contacts";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/w/[slug]/people/[id]/edit">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/people/${id}`);
  const c = await getContact(workspace.id, id);
  if (!c || c.deleted_at) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${contactDisplayName(c)}`}
        back={{ href: `/w/${slug}/people/${id}`, label: "Back to contact" }}
      />
      <ContactForm
        initial={{
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          title: c.title,
          company: c.company ? { id: c.company.id, label: c.company.name } : null,
          roles: c.roles,
          emails: (Array.isArray(c.emails) ? c.emails : []) as {
            value: string;
            label: string;
            is_primary: boolean;
          }[],
          phones: (Array.isArray(c.phones) ? c.phones : []) as {
            value: string;
            label: string;
            type: "mobile" | "landline" | "unknown";
            is_primary: boolean;
          }[],
          address: c.address,
          city: c.city,
          state: c.state,
          zip: c.zip,
          source: c.source,
          tags: c.tags,
          assigned_to: c.assigned_to,
          language: c.language === "es" ? "es" : "en",
          dnc: c.dnc,
          sms_consent: c.sms_consent,
          sms_consent_source: c.sms_consent_source,
          email_opt_out: c.email_opt_out,
          notes: c.notes,
        }}
      />
    </div>
  );
}
