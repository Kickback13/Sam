-- =============================================================================
-- Housing4All Track (Phase 5A) RLS suite: GoHighLevel import
-- (ghl_links + the Vault token functions).
--
-- Same pattern as the other suites: throwaway users/workspaces in a
-- subtransaction that is ALWAYS rolled back (Vault writes included), then
-- impersonation through `authenticated` / `anon` + JWT claims.
-- Safe on the hosted project after the migration is applied:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_ghl_rls.sql
--
-- Covers: only owners/admins can store, read or remove the token; the token is
-- encrypted in vault.secrets and never in a table column; another workspace's
-- admin can't read it; anon can't call anything; bad input is refused;
-- disconnect deletes the secret; ghl_links isolation, writers insert, viewers
-- read only, one link per GHL record.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_ghl_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_ghl_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $ghl$
declare
  results jsonb := '[]'::jsonb;
  user_o uuid := 'aaaaaaaa-0000-4000-a000-0000000005a0';
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000005a1';
  user_v uuid := 'aaaaaaaa-0000-4000-a000-0000000005a3';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000005b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000005a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000005b1';
  fake_token text := 'pit-rls-test-token-0123456789';
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghl-rls-o@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghl-rls-a@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghl-rls-v@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghl-rls-b@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'GHL RLS A', 'h4a-ghl-rls-test-a', 'construction', true),
           (ws_b, 'GHL RLS B', 'h4a-ghl-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_o, 'admin'), (ws_a, user_a, 'agent'), (ws_a, user_v, 'viewer'), (ws_b, user_b, 'admin');

    insert into public.ghl_links (workspace_id, object, ghl_id, local_id)
    values (ws_b, 'opportunity', 'opp_b_1', gen_random_uuid());

    -- ---------- agent of A ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
    begin
      perform public.ghl_save_connection(ws_a, fake_token, 'locA12345', 'A');
      results := results || jsonb_build_object('test', 'agent cannot connect GHL', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot connect GHL', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.ghl_links where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B ghl_links', 'passed', n = 0, 'detail', n);
    insert into public.ghl_links (workspace_id, object, ghl_id, local_id)
    values (ws_a, 'opportunity', 'opp_a_1', gen_random_uuid());
    results := results || jsonb_build_object('test', 'writer records a GHL link', 'passed', true, 'detail', null);
    begin
      insert into public.ghl_links (workspace_id, object, ghl_id, local_id)
      values (ws_a, 'opportunity', 'opp_a_1', gen_random_uuid());
      results := results || jsonb_build_object('test', 'one link per GHL record', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'one link per GHL record', 'passed', sqlstate = '23505', 'detail', sqlstate);
    end;
    begin
      insert into public.ghl_links (workspace_id, object, ghl_id, local_id)
      values (ws_b, 'opportunity', 'opp_x', gen_random_uuid());
      results := results || jsonb_build_object('test', 'A cannot write B ghl_links', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot write B ghl_links', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- admin of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_o, 'role', 'authenticated')::text, true);
    begin
      perform public.ghl_save_connection(ws_a, fake_token, 'bad id!', 'A');
      results := results || jsonb_build_object('test', 'a malformed location id is refused', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'a malformed location id is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    perform public.ghl_save_connection(ws_a, fake_token, 'locA12345', 'AZH test');
    select status::text into t from public.integrations where workspace_id = ws_a and provider = 'gohighlevel';
    results := results || jsonb_build_object('test', 'admin connects GHL', 'passed', t = 'connected', 'detail', t);
    select count(*) into n from public.integrations
     where workspace_id = ws_a and provider = 'gohighlevel' and config::text like '%' || fake_token || '%';
    results := results || jsonb_build_object('test', 'the token is never stored in a table column', 'passed', n = 0, 'detail', n);
    select c.token into t from public.ghl_connection(ws_a) c;
    results := results || jsonb_build_object('test', 'admin reads the token back for the import', 'passed', t = fake_token, 'detail', left(t, 4));
    perform public.ghl_save_connection(ws_a, fake_token || 'v2', 'locA12345', 'AZH test');
    select c.token into t from public.ghl_connection(ws_a) c;
    results := results || jsonb_build_object('test', 'reconnecting replaces the token', 'passed', t = fake_token || 'v2', 'detail', right(t, 2));

    -- ---------- the token is encrypted at rest ----------
    perform set_config('role', 'postgres', true);
    select count(*) into n from vault.secrets
     where name = 'ghl_token:' || ws_a::text and secret <> fake_token || 'v2';
    results := results || jsonb_build_object('test', 'the token is encrypted in Vault', 'passed', n = 1, 'detail', n);
    perform set_config('role', 'authenticated', true);

    -- ---------- others can't read it ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    begin
      perform * from public.ghl_connection(ws_a);
      results := results || jsonb_build_object('test', 'viewer cannot read the token', 'passed', false, 'detail', 'read');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot read the token', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.ghl_links (workspace_id, object, ghl_id, local_id)
      values (ws_a, 'opportunity', 'opp_v', gen_random_uuid());
      results := results || jsonb_build_object('test', 'viewer cannot write ghl_links', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot write ghl_links', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.ghl_links where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads ghl_links', 'passed', n = 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    begin
      perform * from public.ghl_connection(ws_a);
      results := results || jsonb_build_object('test', 'another workspace''s admin cannot read the token', 'passed', false, 'detail', 'read');
    exception when others then
      results := results || jsonb_build_object('test', 'another workspace''s admin cannot read the token', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.ghl_disconnect(ws_a);
      results := results || jsonb_build_object('test', 'another workspace''s admin cannot disconnect', 'passed', false, 'detail', 'done');
    exception when others then
      results := results || jsonb_build_object('test', 'another workspace''s admin cannot disconnect', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      perform * from public.ghl_connection(ws_a);
      results := results || jsonb_build_object('test', 'anon cannot call the token function', 'passed', false, 'detail', 'read');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot call the token function', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      select count(*) into n from public.ghl_links;
      results := results || jsonb_build_object('test', 'anon cannot read ghl_links', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read ghl_links', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- admin disconnects ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_o, 'role', 'authenticated')::text, true);
    perform public.ghl_disconnect(ws_a);
    select count(*) into n from public.ghl_connection(ws_a);
    results := results || jsonb_build_object('test', 'disconnect leaves no readable token', 'passed', n = 0, 'detail', n);
    perform set_config('role', 'postgres', true);
    select count(*) into n from vault.secrets where name = 'ghl_token:' || ws_a::text;
    results := results || jsonb_build_object('test', 'disconnect deletes the Vault secret', 'passed', n = 0, 'detail', n);
    select status::text into t from public.integrations where workspace_id = ws_a and provider = 'gohighlevel';
    results := results || jsonb_build_object('test', 'disconnect marks GHL not connected', 'passed', t = 'not_connected', 'detail', t);

    raise exception using errcode = 'RLSOK', message = 'rolling back GHL RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$ghl$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-ghl-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-ghl-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_ghl_rls_suite();
