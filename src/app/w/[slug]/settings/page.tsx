import type { Metadata } from "next";

import { BrandingForm, WorkspaceProfileForm } from "@/components/settings/workspace-forms";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsGeneralPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("name, profile, owner_email")
    .eq("id", workspace.id)
    .single();
  const profile = (data?.profile ?? {}) as Record<string, string | undefined>;

  return (
    <div className="space-y-5">
      <WorkspaceProfileForm
        initial={{
          name: data?.name ?? workspace.name,
          legal_name: profile.legal_name ?? "",
          license: profile.license ?? "",
          phone: profile.phone ?? "",
          address: profile.address ?? "",
          owner_email: data?.owner_email ?? "",
        }}
      />
      <BrandingForm initial={workspace.brand} />
    </div>
  );
}
