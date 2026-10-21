import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { toJson } from "@/lib/db/json";
import type { Database } from "@/lib/db/types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

import type {
  AlertEmailStatus,
  DealStore,
  EmailPatch,
  IngestItem,
  IngestResponse,
  SaveScoresResponse,
  ScoreRow,
} from "../pipeline/types";

type Client = SupabaseClient<Database>;

/** A database error with its Postgres/PostgREST code kept for friendly messages. */
export class StoreError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

function unwrap<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new StoreError(res.error.message, res.error.code);
  return res.data as T;
}

/** The signed-in user's session: every call checks membership/role in the database. */
export function sessionStore(
  supabase: Client,
  workspaceId: string,
  emailId: string | null = null,
): DealStore {
  return {
    async ingest(items: IngestItem[]) {
      return unwrap<IngestResponse>(
        await supabase.rpc("h4a_ingest_listings", {
          p_workspace_id: workspaceId,
          p_items: toJson(items),
          p_email_id: emailId ?? undefined,
        }),
      );
    },
    async saveScores(scores: ScoreRow[], alertable: string[], emailStatus) {
      return unwrap<SaveScoresResponse>(
        await supabase.rpc("h4a_save_scores", {
          p_workspace_id: workspaceId,
          p_scores: toJson(scores),
          p_alertable: alertable,
          p_email_status: emailStatus,
        }),
      );
    },
    async updateEmail(patch: EmailPatch) {
      if (!emailId) return;
      unwrap(
        await supabase.rpc("h4a_update_email", {
          p_workspace_id: workspaceId,
          p_email_id: emailId,
          p_patch: toJson(patch),
        }),
      );
    },
    async setAlertEmailStatus(alertId: string, status: AlertEmailStatus, error?: string | null) {
      unwrap(
        await supabase.rpc("h4a_set_alert_email_status", {
          p_workspace_id: workspaceId,
          p_alert_id: alertId,
          p_status: status,
          p_error: error ?? undefined,
        }),
      );
    },
  };
}

/** Publishable-key client with no session (role anon). Used only for the inbound token functions. */
export function inboundClient(): Client {
  return createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Forwarded-email path (no user session, no service-role key): every call
 * presents the forwarding-address token, which only reaches that workspace.
 */
export function inboundStore(client: Client, token: string, emailId: string): DealStore {
  return {
    async ingest(items: IngestItem[]) {
      return unwrap<IngestResponse>(
        await client.rpc("h4a_inbound_ingest", {
          p_token: token,
          p_email_id: emailId,
          p_items: toJson(items),
        }),
      );
    },
    async saveScores(scores: ScoreRow[], _alertable: string[], emailStatus) {
      // The database decides which listings may alert (those this email created or changed).
      return unwrap<SaveScoresResponse>(
        await client.rpc("h4a_inbound_save_scores", {
          p_token: token,
          p_email_id: emailId,
          p_scores: toJson(scores),
          p_email_status: emailStatus,
        }),
      );
    },
    async updateEmail(patch: EmailPatch) {
      unwrap(
        await client.rpc("h4a_inbound_update_email", {
          p_token: token,
          p_email_id: emailId,
          p_patch: toJson(patch),
        }),
      );
    },
    async setAlertEmailStatus(alertId: string, status: AlertEmailStatus, error?: string | null) {
      unwrap(
        await client.rpc("h4a_inbound_set_alert_email_status", {
          p_token: token,
          p_alert_id: alertId,
          p_status: status,
          p_error: error ?? undefined,
        }),
      );
    },
  };
}
