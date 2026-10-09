import "server-only";

import { revalidatePath } from "next/cache";

import { createClient, type ServerSupabase } from "@/lib/supabase/server";

import { getSessionUser, type SessionUser } from "./auth";

export type ActionContext = { user: SessionUser; supabase: ServerSupabase };

/** Session for a server action. RLS enforces workspace access on every query that follows. */
export async function actionContext(): Promise<ActionContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

/** Refresh every page in every workspace for this user (counts in the sidebar included). */
export function revalidateWorkspace() {
  revalidatePath("/w/[slug]", "layout");
}

export const NOT_SIGNED_IN = { ok: false as const, error: "Your session expired. Sign in again." };
