import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

import type { Database } from "@/lib/db/types";

/**
 * RLS tests run against a real Supabase stack — the local one by default
 * (`pnpm db:start`). They create throwaway users/workspaces directly in Postgres,
 * so they refuse non-local databases unless RLS_ALLOW_REMOTE=1.
 */
export const DB_URL =
  process.env.RLS_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const API_URL = process.env.RLS_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const PUBLISHABLE_KEY =
  process.env.RLS_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export function assertSafeTarget() {
  const host = new URL(DB_URL).hostname;
  if (!["127.0.0.1", "localhost"].includes(host) && process.env.RLS_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Refusing to create test users on non-local database "${host}" (set RLS_ALLOW_REMOTE=1 to override).`,
    );
  }
}

export async function db(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

export type TestUser = { id: string; email: string; password: string };

export const USERS = {
  a: { id: "7e570000-0000-4000-a000-00000000000a", email: "rls-vitest-a@example.test" },
  b: { id: "7e570000-0000-4000-a000-00000000000b", email: "rls-vitest-b@example.test" },
};
export const WORKSPACES = { a: "rls-vitest-a", b: "rls-vitest-b" };

/** (Re)create two users, each the agent of their own demo workspace with one contact. */
export async function seed(): Promise<{
  a: TestUser;
  b: TestUser;
  wsA: string;
  wsB: string;
  contactB: string;
  inviteB: string;
}> {
  assertSafeTarget();
  const password = randomBytes(18).toString("base64url");
  const c = await db();
  try {
    await c.query("begin");
    for (const slug of Object.values(WORKSPACES)) {
      await c.query("delete from public.workspaces where slug = $1", [slug]);
    }
    for (const u of Object.values(USERS)) {
      await c.query("delete from auth.users where id = $1", [u.id]);
      await c.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
           extensions.crypt($3, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
           '', '', '', '', '', '')`,
        [u.id, u.email, password],
      );
      await c.query(
        `insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $3::text, 'email', jsonb_build_object('sub', $3::text, 'email', $2::text), now(), now())`,
        [u.id, u.email, u.id],
      );
    }
    const wsA = (
      await c.query(
        `insert into public.workspaces (name, slug, business_type, is_demo) values ('RLS A', $1, 'real_estate', true) returning id`,
        [WORKSPACES.a],
      )
    ).rows[0].id as string;
    const wsB = (
      await c.query(
        `insert into public.workspaces (name, slug, business_type, is_demo) values ('RLS B', $1, 'construction', true) returning id`,
        [WORKSPACES.b],
      )
    ).rows[0].id as string;
    await c.query(
      `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'agent'), ($3, $4, 'agent')`,
      [wsA, USERS.a.id, wsB, USERS.b.id],
    );
    await c.query(
      `insert into public.contacts (workspace_id, first_name, last_name) values ($1, 'Alpha', 'Owner')`,
      [wsA],
    );
    const contactB = (
      await c.query(
        `insert into public.contacts (workspace_id, first_name, last_name) values ($1, 'Bravo', 'Owner') returning id`,
        [wsB],
      )
    ).rows[0].id as string;
    const inviteB = (
      await c.query(
        `insert into public.invites (workspace_id, email, role) values ($1, 'someone@example.test', 'admin') returning token`,
        [wsB],
      )
    ).rows[0].token as string;
    await c.query("commit");
    return {
      a: { ...USERS.a, password },
      b: { ...USERS.b, password },
      wsA,
      wsB,
      contactB,
      inviteB,
    };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}

export async function cleanup() {
  const c = await db();
  try {
    for (const slug of Object.values(WORKSPACES))
      await c.query("delete from public.workspaces where slug = $1", [slug]);
    for (const u of Object.values(USERS))
      await c.query("delete from auth.users where id = $1", [u.id]);
  } finally {
    await c.end();
  }
}

export async function signIn(user: TestUser): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(API_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`sign-in failed for ${user.email}: ${error.message}`);
  return client;
}

export function anon(): SupabaseClient<Database> {
  return createClient<Database>(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
}
