import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CommunityStaffPage, staffTab } from "@/features/network/components/staff-page";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Community" };

/** AZH Community (Phase 8): the team side, on the Housing4All Network engine. */
export default async function CommunityAdminPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/community">) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { workspace, canWrite, user } = await getWorkspaceContext(slug);
  if (workspace.businessType !== "construction") notFound();
  return (
    <CommunityStaffPage
      slug={slug}
      tab={staffTab(tab)}
      workspace={{ id: workspace.id, name: workspace.name }}
      canWrite={canWrite}
      userId={user.id}
      kind="construction"
    />
  );
}
