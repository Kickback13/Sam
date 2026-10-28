import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/features/network/components/member-forms";
import { memberTypeLabel } from "@/features/network/schema";
import { getMyProfile, getNetworkContext } from "@/features/network/server/queries";
import { signOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "My profile" };

export default async function MePage({ params }: PageProps<"/n/[slug]/me">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  if (!ctx.memberId) notFound();
  const p = await getMyProfile(ctx.workspaceId, ctx.userId);
  if (!p) notFound();
  return (
    <>
      <h1 className="font-display text-xl font-bold">My profile</h1>
      <p className="text-sm text-muted-foreground">Member type: {memberTypeLabel(p.member_type)}</p>
      <ProfileForm
        workspaceId={ctx.workspaceId}
        initial={{
          display_name: p.display_name,
          headline: p.headline ?? "",
          bio: p.bio ?? "",
          city: p.city ?? "",
          show_in_directory: p.show_in_directory,
          public_email: p.public_email ?? "",
          public_phone: p.public_phone ?? "",
        }}
      />
      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </>
  );
}
