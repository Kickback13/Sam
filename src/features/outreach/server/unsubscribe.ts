import "server-only";

import { createClient } from "@/lib/supabase/server";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUnsubscribeToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export type UnsubscribeInfo = {
  workspaceName: string;
  emailHint: string | null;
  unsubscribed: boolean;
};

/** What the public page shows for a token (anon-safe RPC). null = unknown token. */
export async function getUnsubscribeInfo(token: string): Promise<UnsubscribeInfo | null> {
  if (!isUnsubscribeToken(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outreach_unsubscribe_info", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  return row
    ? {
        workspaceName: row.workspace_name,
        emailHint: row.email_hint,
        unsubscribed: row.unsubscribed,
      }
    : null;
}

/** One-click unsubscribe. Idempotent. Returns false for an unknown token. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!isUnsubscribeToken(token)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outreach_unsubscribe", { p_token: token });
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
