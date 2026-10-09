import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteButton } from "@/components/auth/accept-invite-button";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { isTestPasswordLoginEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { getAuthProviders } from "@/server/auth-settings";

export const metadata: Metadata = { title: "Invitation" };

const STATUS_COPY: Record<string, string> = {
  not_found: "This invite link isn't valid. Ask the person who invited you for a new one.",
  expired: "This invite has expired. Ask an admin to send a new one.",
  revoked: "This invite was revoked.",
  accepted: "This invite has already been used.",
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite", { p_token: token });
  const invite = data?.[0];
  const user = await getSessionUser();

  if (!invite || invite.status !== "valid") {
    const status = invite?.status ?? "not_found";
    return (
      <AuthFrame title="Invitation" subtitle={invite?.workspace_name ?? undefined}>
        <p className="text-sm text-muted-foreground">
          {STATUS_COPY[status] ?? STATUS_COPY.not_found}
        </p>
        {status === "accepted" && user && invite?.workspace_slug && (
          <Button asChild className="mt-4 w-full">
            <Link href={`/w/${invite.workspace_slug}/today`}>Open {invite.workspace_name}</Link>
          </Button>
        )}
      </AuthFrame>
    );
  }

  const role = ROLE_LABELS[invite.role];
  const title = `Join ${invite.workspace_name}`;
  const subtitle = `You've been invited as ${/^[AEIOU]/.test(role) ? "an" : "a"} ${role.toLowerCase()}.`;

  if (user) {
    return (
      <AuthFrame title={title} subtitle={subtitle}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Signed in as <strong className="text-foreground">{user.email}</strong>.
            {invite.is_email_bound && ` This invite is for ${invite.email_hint}.`}
          </p>
          <AcceptInviteButton token={token} label={`Join ${invite.workspace_name}`} />
        </div>
      </AuthFrame>
    );
  }

  const providers = await getAuthProviders();
  return (
    <AuthFrame title={title} subtitle={`${subtitle} Sign in to accept.`}>
      {invite.is_email_bound && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">
          Use the email this invite was sent to: <strong>{invite.email_hint}</strong>
        </p>
      )}
      <LoginForm
        next={`/invite/${token}`}
        googleEnabled={providers.google}
        passwordEnabled={isTestPasswordLoginEnabled()}
        emailHint={invite.email_hint}
      />
    </AuthFrame>
  );
}
