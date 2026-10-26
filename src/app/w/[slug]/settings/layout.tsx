import { PageHeader } from "@/components/common/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AZH_SETTINGS_TABS } from "@/features/azh/nav";
import { H4A_SETTINGS_TABS } from "@/features/h4a/nav";
import { ROLE_LABELS } from "@/lib/constants";
import { getWorkspaceContext } from "@/server/workspace";

export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const { workspace, role, isAdmin } = await getWorkspaceContext(slug);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description={`${workspace.name} · you are ${ROLE_LABELS[role].toLowerCase()}${isAdmin ? "" : " (read-only)"}`}
      />
      <SettingsNav
        slug={slug}
        extraTabs={
          workspace.businessType === "construction" ? AZH_SETTINGS_TABS : H4A_SETTINGS_TABS
        }
      />
      {children}
    </div>
  );
}
