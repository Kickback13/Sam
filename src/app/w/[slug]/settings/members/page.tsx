import type { Metadata } from "next";

import { MembersManager, type InviteRow } from "@/components/settings/members-manager";
import { createClient } from "@/lib/supabase/server";
import { getMembers } from "@/server/queries/members";
import { requestOrigin } from "@/server/origin";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Members" };

function inviteStatus(i: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): InviteRow["status"] {
  if (i.accepted_at) return "accepted";
  if (i.revoked_at) return "revoked";
  return new Date(i.expires_at).getTime() < Date.now() ? "expired" : "pending";
}

export default async function MembersPage({ params }: PageProps<"/w/[slug]/settings/members">) {
  const { slug } = await params;
  const { workspace, isAdmin } = await getWorkspaceContext(slug);
  const members = await getMembers(workspace.id);
  let invites: InviteRow[] = [];

  if (isAdmin) {
    const supabase = await createClient();
    const origin = await requestOrigin();
    const { data } = await supabase
      .from("invites")
      .select("id, email, role, token, created_at, expires_at, accepted_at, revoked_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(50);
    invites = (data ?? []).map((i) => {
      const status = inviteStatus(i);
      return {
        id: i.id,
        email: i.email,
        role: i.role,
        status,
        url: status === "pending" ? `${origin}/invite/${i.token}` : null,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
      };
    });
  }

  return (
    <MembersManager
      members={members}
      invites={invites}
      hasOwner={members.some((m) => m.role === "owner")}
    />
  );
}
