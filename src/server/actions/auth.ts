"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isTestPasswordLoginEnabled } from "@/lib/env";
import { safeNext } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/common";
import { requestOrigin } from "@/server/origin";

const emailSchema = z.email("Enter a valid email address");

function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}

export async function sendMagicLink(input: { email: string; next?: string }): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input.email?.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "Enter a valid email address" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: callbackUrl(await requestOrigin(), input.next ?? "/"), shouldCreateUser: true },
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "Too many sign-in emails. Wait a minute and try again." };
    console.error("signInWithOtp failed", error.message);
    return { ok: false, error: "We couldn't send the sign-in email. Try again in a moment." };
  }
  return { ok: true, data: undefined };
}

export async function signInWithGoogle(input: { next?: string }): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await requestOrigin(), input.next ?? "/") },
  });
  if (error || !data.url) return { ok: false, error: "Google sign-in isn't available right now." };
  redirect(data.url);
}

/** Dev/test-only. Disabled unless ENABLE_TEST_PASSWORD_LOGIN=true and never on Vercel production. */
export async function signInWithPassword(input: { email: string; password: string; next?: string }): Promise<ActionResult> {
  if (!isTestPasswordLoginEnabled()) return { ok: false, error: "Password sign-in is disabled." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) return { ok: false, error: "Wrong email or password." };
  await supabase.rpc("accept_pending_invites");
  redirect(safeNext(input.next));
}

// --- Form actions (progressively enhanced: work before JavaScript loads) ------

export type LoginFormState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

export async function magicLinkFormAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");
  const result = await sendMagicLink({ email, next: String(formData.get("next") ?? "/") });
  if (!result.ok) return { status: "error", message: result.error, email };
  return { status: "sent", email: email.trim().toLowerCase() };
}

export async function passwordFormAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");
  const result = await signInWithPassword({
    email,
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "/"),
  });
  return result.ok ? { status: "idle" } : { status: "error", message: result.error, email };
}

export async function googleFormAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const result = await signInWithGoogle({ next: String(formData.get("next") ?? "/") });
  return result.ok ? { status: "idle" } : { status: "error", message: result.error };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
