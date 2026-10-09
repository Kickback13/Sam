"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/common";
import { friendlyDbError } from "@/server/errors";

export async function acceptInvite(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error || !slug) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  redirect(`/w/${slug}/today`);
}
