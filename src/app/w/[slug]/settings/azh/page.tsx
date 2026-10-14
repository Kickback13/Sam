import type { Metadata } from "next";

import { AzhSettingsForm } from "@/features/azh/components/azh-settings-form";
import { getAzhSettings, getZipRoutes, requireConstruction } from "@/features/azh/server/queries";
import { requestOrigin } from "@/server/origin";

export const metadata: Metadata = { title: "AZH settings" };

export default async function AzhSettingsPage({ params }: PageProps<"/w/[slug]/settings/azh">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await requireConstruction(slug);
  const [settings, routes, origin] = await Promise.all([
    getAzhSettings(workspace.id),
    getZipRoutes(workspace.id),
    requestOrigin(),
  ]);
  if (!settings) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        AZH settings haven&apos;t been initialized for this workspace. Apply the AZH migrations,
        then reload.
      </p>
    );
  }
  return (
    <>
      {!isAdmin && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Only owners and admins can change these settings.
        </p>
      )}
      <AzhSettingsForm
        initial={{
          cslb_license: settings.cslb_license ?? "",
          service_types: settings.service_types,
          intake_enabled: settings.intake_enabled,
          san_diego_assignee: settings.san_diego_assignee ?? "",
          fallbrook_assignee: settings.fallbrook_assignee ?? "",
        }}
        fallbrookZips={routes.filter((r) => r.office === "fallbrook").map((r) => r.zip)}
        formUrl={`${origin}/r/${slug}`}
        embedUrl={`${origin}/r/${slug}/embed`}
      />
    </>
  );
}
