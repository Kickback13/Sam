/**
 * Public env values. Both are public-safe (RLS protects data). Read lazily so
 * builds don't need them, and fail loudly at runtime if they're missing.
 */
export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)");
  return value;
}

export function supabasePublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)");
  return value;
}

/** Email+password sign-in exists only for automated tests and never on Vercel production. */
export function isTestPasswordLoginEnabled(): boolean {
  return (
    process.env.ENABLE_TEST_PASSWORD_LOGIN === "true" && process.env.VERCEL_ENV !== "production"
  );
}
