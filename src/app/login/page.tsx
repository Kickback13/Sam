import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { isTestPasswordLoginEnabled } from "@/lib/env";
import { safeNext } from "@/lib/redirects";
import { getSessionUser } from "@/server/auth";
import { getAuthProviders } from "@/server/auth-settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getSessionUser()) redirect(next);

  const providers = await getAuthProviders();
  const error = typeof params.error === "string" ? params.error.slice(0, 200) : null;

  return (
    <AuthFrame title="Sign in" subtitle="Housing4All · AZH Builders">
      <LoginForm
        next={next}
        googleEnabled={providers.google}
        passwordEnabled={isTestPasswordLoginEnabled()}
        initialError={error}
      />
    </AuthFrame>
  );
}
