import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import type { SwitcherWorkspace } from "@/components/shell/workspace-switcher";
import { brandStyleBlock } from "@/lib/brand";
import { getMembers, getWorkspaceCounts } from "@/server/queries/members";
import { getWorkspaceContext, type WorkspaceSummary } from "@/server/workspace";

const BUSINESS_LABEL = {
  real_estate: "Real estate · Multifamily",
  construction: "General contractor",
} as const;

function toSwitcher(w: WorkspaceSummary): SwitcherWorkspace {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    isDemo: w.isDemo,
    businessLabel: w.isDemo ? "Demo · fictional data" : BUSINESS_LABEL[w.businessType],
    accent: w.brand.accent,
    logoText: w.brand.logoText ?? w.name.slice(0, 3).toUpperCase(),
  };
}

export async function generateMetadata({ params }: LayoutProps<"/w/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getWorkspaceContext(slug);
  return { title: { default: ctx.workspace.name, template: `%s · ${ctx.workspace.name}` } };
}

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const ctx = await getWorkspaceContext(slug);
  const [counts, members] = await Promise.all([
    getWorkspaceCounts(ctx.workspace.id),
    getMembers(ctx.workspace.id),
  ]);

  return (
    <>
      {/* Validated brand tokens → CSS variables: the whole app re-skins per workspace. */}
      <style data-testid="brand-vars">{brandStyleBlock(ctx.workspace.brand)}</style>
      <AppShell
        ws={{
          id: ctx.workspace.id,
          slug: ctx.workspace.slug,
          name: ctx.workspace.name,
          businessType: ctx.workspace.businessType,
          isDemo: ctx.workspace.isDemo,
          role: ctx.role,
          canWrite: ctx.canWrite,
          isAdmin: ctx.isAdmin,
          userId: ctx.user.id,
          members: members.map((m) => ({
            id: m.userId,
            name: m.name,
            email: m.email,
            role: m.role,
          })),
        }}
        current={toSwitcher(ctx.workspace)}
        workspaces={ctx.workspaces.map(toSwitcher)}
        counts={counts}
        user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role }}
      >
        {children}
      </AppShell>
    </>
  );
}
