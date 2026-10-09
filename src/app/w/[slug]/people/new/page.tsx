import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ContactForm } from "@/components/people/contact-form";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({ params }: PageProps<"/w/[slug]/people/new">) {
  const { slug } = await params;
  const { canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/people`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New contact" back={{ href: `/w/${slug}/people`, label: "People" }} />
      <ContactForm />
    </div>
  );
}
