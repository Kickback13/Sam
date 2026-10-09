import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

import { E2E_USERS, E2E_WORKSPACES, LOCAL_DB_URL } from "./fixtures/constants";

/**
 * Provisions confirmed test users + two is_demo test workspaces in the LOCAL
 * Supabase stack. Refuses to touch any non-local database so test accounts can
 * never land in Sam's project.
 */
export default async function globalSetup() {
  const url = process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Refusing to seed e2e users into non-local database host "${host}".`);
  }

  const password = process.env.E2E_PASSWORD ?? randomBytes(18).toString("base64url");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("begin");

    for (const ws of E2E_WORKSPACES) {
      await db.query(
        `insert into public.workspaces (name, slug, business_type, is_demo, brand)
         values ($1, $2, $3, true, $4::jsonb)
         on conflict (slug) do update set brand = excluded.brand, name = excluded.name`,
        [ws.name, ws.slug, ws.businessType, JSON.stringify(ws.brand)],
      );
      // Start every run from an empty workspace (local stack only).
      await db.query(
        `delete from public.deals where workspace_id = (select id from public.workspaces where slug = $1)`,
        [ws.slug],
      );
      for (const table of ["activities", "tasks", "deal_contacts", "properties", "contacts", "companies", "imports", "audit_log"]) {
        await db.query(`delete from public.${table} where workspace_id = (select id from public.workspaces where slug = $1)`, [ws.slug]);
      }
      await db.query(
        `insert into public.pipelines (workspace_id, name, kind, is_default)
         select id, $2, $3::public.pipeline_kind, true from public.workspaces w
         where slug = $1 and not exists (select 1 from public.pipelines p where p.workspace_id = w.id)`,
        [ws.slug, ws.pipeline.name, ws.pipeline.kind],
      );
      for (const [i, stage] of ws.pipeline.stages.entries()) {
        await db.query(
          `insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color, is_won, is_lost)
           select p.workspace_id, p.id, $2, $3, $4, $5, $6
           from public.pipelines p join public.workspaces w on w.id = p.workspace_id
           where w.slug = $1 and p.is_default
             and not exists (select 1 from public.pipeline_stages s where s.pipeline_id = p.id and s.name = $2)`,
          [ws.slug, stage.name, i + 1, stage.color, stage.isWon ?? false, stage.isLost ?? false],
        );
      }
    }

    for (const user of E2E_USERS) {
      await db.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
           extensions.crypt($3, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', $4::text), now(), now(),
           '', '', '', '', '', '')
         on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = now()`,
        [user.id, user.email, password, user.name],
      );
      await db.query(
        `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $3::text, 'email', jsonb_build_object('sub', $3::text, 'email', $2::text, 'email_verified', true), now(), now(), now())
         on conflict (provider_id, provider) do nothing`,
        [user.id, user.email, user.id],
      );
      await db.query(`update public.profiles set full_name = $2, last_workspace_id = null where id = $1`, [user.id, user.name]);
      for (const m of user.memberships) {
        await db.query(
          `insert into public.workspace_members (workspace_id, user_id, role)
           select id, $2, $3::public.member_role from public.workspaces where slug = $1
           on conflict (workspace_id, user_id) do update set role = excluded.role`,
          [m.slug, user.id, m.role],
        );
      }
    }
    await db.query("commit");
  } catch (err) {
    await db.query("rollback");
    throw err;
  } finally {
    await db.end();
  }

  const dir = path.join(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "credentials.json"), JSON.stringify({ password }), { mode: 0o600 });
}
