import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
};

/** The signed-in user (JWT verified by getClaims), cached for the request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, email")
    .eq("id", claims.sub)
    .maybeSingle();

  const email = (typeof claims.email === "string" ? claims.email : null) ?? profile?.email ?? null;
  return {
    id: claims.sub,
    email,
    name: profile?.full_name?.trim() || email?.split("@")[0] || "You",
    avatarUrl: profile?.avatar_url ?? null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
