import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

/** OAuth + magic-link (PKCE) callback: exchange the code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await supabase.rpc("accept_pending_invites");
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("exchangeCodeForSession failed", error.message);
  }

  const reason =
    searchParams.get("error_description") ?? "That sign-in link is invalid or has expired.";
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
