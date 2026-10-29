import type { Metadata } from "next";
import Link from "next/link";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { JoinForm } from "@/features/network/components/member-forms";
import { isTestPasswordLoginEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { getAuthProviders } from "@/server/auth-settings";

export const metadata: Metadata = { title: "Join the Network" };

const STATUS_COPY: Record<string, string> = {
  not_found: "This invite link isn't valid. Ask the person who invited you for a new one.",
  expired: "This invite has expired. Ask for a new one.",
  revoked: "This invite was withdrawn.",
  accepted: "This invite has already been used.",
};

/** Public: anyone with the link can see who invited them, then sign in and join. */
export default async function JoinPage({ params }: PageProps<"/n/[slug]/join/[token]">) {
  const { slug, token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{16,128}$/.test(token)
    ? await supabase.rpc("get_network_invite", { p_token: token })
    : { data: null };
  const invite = data?.[0];
  const user = await getSessionUser();

  if (!invite || invite.workspace_slug !== slug || invite.status !== "valid") {
    const status = invite && invite.workspace_slug === slug ? invite.status : "not_found";
    return (
      <AuthFrame title="Housing4All Network" subtitle={invite?.workspace_name}>
        <p className="text-sm text-muted-foreground">
          {STATUS_COPY[status] ?? STATUS_COPY.not_found}
        </p>
        {status === "accepted" && user && (
          <Button asChild className="mt-4 w-full">
            <Link href={`/n/${slug}`}>Open the Network</Link>
          </Button>
        )}
      </AuthFrame>
    );
  }

  const title = `Join the ${invite.workspace_name} Network`;
  const subtitle =
    "A private community for investors and partners: deals, events and the member directory.";
  if (user) {
    return (
      <AuthFrame title={title} subtitle={subtitle}>
        <p className="mb-4 text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{user.email}</strong>.
          {invite.is_email_bound && ` This invite is for ${invite.email_hint}.`}
        </p>
        <JoinForm
          token={token}
          defaultName={invite.invited_name ?? user.name ?? ""}
          networkName={`the ${invite.workspace_name} Network`}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          By joining, {invite.workspace_name} adds you to its contacts. You choose what other
          members see on your profile, and you can leave any time.
        </p>
      </AuthFrame>
    );
  }
  const providers = await getAuthProviders();
  return (
    <AuthFrame title={title} subtitle={`${subtitle} Sign in or create your login to accept.`}>
      {invite.is_email_bound && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">
          Use the email this invite was sent to: <strong>{invite.email_hint}</strong>
        </p>
      )}
      <LoginForm
        next={`/n/${slug}/join/${token}`}
        googleEnabled={providers.google}
        passwordEnabled={isTestPasswordLoginEnabled()}
        emailHint={invite.email_hint}
      />
    </AuthFrame>
  );
}
