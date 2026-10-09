import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

/**
 * token_hash flow (works across devices — e.g. link requested on a laptop, opened on a phone).
 * Enable by setting the Supabase email templates to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      await supabase.rpc("accept_pending_invites");
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  const url = new URL("/login", origin);
  url.searchParams.set("error", "That sign-in link is invalid or has expired.");
  return NextResponse.redirect(url);
}
