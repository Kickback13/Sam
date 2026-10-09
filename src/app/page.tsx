import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { LAST_WORKSPACE_COOKIE } from "@/lib/supabase/proxy";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/server/actions/auth";
import { getSessionUser } from "@/server/auth";
import { getMyWorkspaces } from "@/server/workspace";

/** Entry point: send the user to their last-used workspace. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  await supabase.rpc("accept_pending_invites");
  const workspaces = await getMyWorkspaces();

  if (workspaces.length > 0) {
    const fromCookie = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
    let target = workspaces.find((w) => w.slug === fromCookie);
    if (!target) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("last_workspace_id")
        .eq("id", user.id)
        .maybeSingle();
      target = workspaces.find((w) => w.id === profile?.last_workspace_id) ?? workspaces[0];
    }
    redirect(`/w/${target.slug}/today`);
  }

  return (
    <AuthFrame title="No workspace yet" subtitle={`Signed in as ${user.email ?? user.name}`}>
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          Your account doesn&apos;t have access to a workspace. Ask an admin to invite this email address from{" "}
          <strong className="text-foreground">Settings → Members</strong>, then open the invite link.
        </p>
        <form action={signOut}>
          <Button variant="outline" className="w-full" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </AuthFrame>
  );
}
