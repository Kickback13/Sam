import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { PasteTool, type PasteSample } from "@/features/h4a/components/paste-tool";
import { PLACEHOLDER_EMAILS } from "@/features/h4a/email/fixtures/placeholder-emails";
import { getRealEstateContext } from "@/features/h4a/server/context";

export const metadata: Metadata = { title: "Paste an email" };

export default async function PastePage({ params }: PageProps<"/w/[slug]/deal-finder/paste">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getRealEstateContext(slug);
  if (!isAdmin) redirect(`/w/${slug}/deal-finder`);
  // Placeholder fixtures are offered only in the Demo workspace (never in Sam's workspaces).
  const samples: PasteSample[] = workspace.isDemo
    ? PLACEHOLDER_EMAILS.map((e) => ({
        key: e.key,
        label: e.label.replace(/^Placeholder: /, ""),
        from: e.from ?? "",
        subject: e.subject ?? "",
        body: e.html ?? e.text ?? "",
      }))
    : [];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: `/w/${slug}/deal-finder`, label: "Deal Finder" }}
        title="Paste an email"
        description="Admin tool: runs the same parser pipeline as forwarded alert emails, with no email setup. Listings are deduped, scored and alerted exactly as if the email had been forwarded."
      />
      <PasteTool samples={samples} />
    </div>
  );
}
