import type { Metadata } from "next";

import { getRealEstateContext } from "@/features/h4a/server/context";
import { CommunityStaffPage, staffTab } from "@/features/network/components/staff-page";

export const metadata: Metadata = { title: "Network" };

/** Housing4All Network: the team side (members, invites, posts, events). */
export default async function NetworkAdminPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/network">) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { workspace, canWrite, user } = await getRealEstateContext(slug);
  return (
    <CommunityStaffPage
      slug={slug}
      tab={staffTab(tab)}
      workspace={{ id: workspace.id, name: workspace.name }}
      canWrite={canWrite}
      userId={user.id}
      kind="real_estate"
    />
  );
}
