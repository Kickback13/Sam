import "server-only";

import webpush from "web-push";

import type { ServerSupabase } from "@/lib/supabase/server";

import { pushConfig, type PushPayload } from "../push";

type Sender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
) => Promise<unknown>;

/**
 * Notify the community's opted-in devices about a team post or event. Runs as the team
 * member who posted (network_push_targets refuses anyone else). Never throws: a failed
 * notification must not undo the post. Devices the push service reports gone are dropped.
 */
export async function notifyCommunity(
  supabase: ServerSupabase,
  workspaceId: string,
  payload: PushPayload,
  send?: Sender,
): Promise<{ sent: number; gone: number; skipped?: string }> {
  const cfg = pushConfig();
  if (!cfg.connected) return { sent: 0, gone: 0, skipped: "not connected" };
  const { data, error } = await supabase.rpc("network_push_targets", {
    p_workspace_id: workspaceId,
  });
  if (error)
    return { sent: 0, gone: 0, skipped: error.code === "42501" ? "not team" : "lookup failed" };
  const targets = data ?? [];
  if (!targets.length) return { sent: 0, gone: 0 };
  const deliver: Sender =
    send ??
    ((sub, body) =>
      webpush.sendNotification(sub, body, {
        vapidDetails: {
          subject: cfg.subject!,
          publicKey: cfg.publicKey!,
          privateKey: cfg.privateKey!,
        },
        TTL: 60 * 60 * 24,
        urgency: "normal",
      }));
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  for (let i = 0; i < targets.length; i += 20) {
    await Promise.all(
      targets.slice(i, i + 20).map(async (t) => {
        try {
          await deliver({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body);
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(t.endpoint);
        }
      }),
    );
  }
  if (gone.length)
    await supabase.rpc("network_push_forget", { p_workspace_id: workspaceId, p_endpoints: gone });
  return { sent, gone: gone.length };
}
