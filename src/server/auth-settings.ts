import "server-only";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Which sign-in providers are enabled on the Supabase project (public endpoint).
 * Lets the login page show an honest "not connected" state instead of a broken button.
 */
export async function getAuthProviders(): Promise<{
  google: boolean;
  email: boolean;
  reachable: boolean;
}> {
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey() },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { google: false, email: true, reachable: false };
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return {
      google: Boolean(json.external?.google),
      email: json.external?.email !== false,
      reachable: true,
    };
  } catch {
    return { google: false, email: true, reachable: false };
  }
}
