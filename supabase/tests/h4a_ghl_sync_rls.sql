-- =============================================================================
-- Housing4All Track (Phase 5B) RLS suite: automatic GoHighLevel import
-- (ghl_sync_settings, ghl_sync_state, ghl_sync_claim / ghl_sync_finish).
--
-- Same pattern as the other suites: throwaway users/workspaces in a
-- subtransaction that is ALWAYS rolled back, then impersonation through
-- `authenticated` / `anon` + JWT claims. Safe on the hosted project after the
-- migration is applied:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_ghl_sync_rls.sql
--
-- Covers: only owners/admins change settings or run the import; run state can
-- only be written through the functions; the lock blocks a second run and
-- respects the interval; "Import now" forces; not connected → no run; results
-- and audit are recorded; workspace isolation; writers/viewers on sync state;
-- anon gets nothing.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_ghl_sync_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_ghl_sync_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $sync$
declare
  results jsonb := '[]'::jsonb;
  user_o uuid := 'aaaaaaaa-0000-4000-a000-0000000005c0';
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000005c1';
  user_v uuid := 'aaaaaaaa-0000-4000-a000-0000000005c3';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000005c1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000005c1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000005c1';
  n bigint;
  t text;
  b boolean;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghlsync-rls-o@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghlsync-rls-a@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghlsync-rls-v@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ghlsync-rls-b@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'GHL sync RLS A', 'h4a-ghlsync-rls-test-a', 'real_estate', true),
           (ws_b, 'GHL sync RLS B', 'h4a-ghlsync-rls-test-b', 'construction', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_o, 'admin'), (ws_a, user_a, 'agent'), (ws_a, user_v, 'viewer'), (ws_b, user_b, 'admin');

    -- Both connected (the token itself lives in Vault; the claim only checks the status).
    insert into public.integrations (workspace_id, provider, status, config, connected_at)
    values (ws_a, 'gohighlevel', 'connected', '{"location_id":"locA12345"}', now()),
           (ws_b, 'gohighlevel', 'connected', '{"location_id":"locB12345"}', now());
    insert into public.ghl_sync_settings (workspace_id, enabled, interval_minutes)
    values (ws_b, true, 60);
    insert into public.ghl_sync_state (workspace_id, object, ghl_id, fingerprint)
    values (ws_b, 'contact', 'c_b_1', 'fp');

    -- ---------- agent of A ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.ghl_sync_settings (workspace_id, enabled) values (ws_a, true);
      results := results || jsonb_build_object('test', 'agent cannot turn on the automatic import', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot turn on the automatic import', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.ghl_sync_claim(ws_a, true);
      results := results || jsonb_build_object('test', 'agent cannot run the import', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot run the import', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    insert into public.ghl_sync_state (workspace_id, object, ghl_id, fingerprint)
    values (ws_a, 'contact', 'c_a_1', 'fp1');
    results := results || jsonb_build_object('test', 'writer records a sync fingerprint', 'passed', true, 'detail', null);
    update public.ghl_sync_state set fingerprint = 'fp2' where workspace_id = ws_a and ghl_id = 'c_a_1';
    select fingerprint into t from public.ghl_sync_state where workspace_id = ws_a and ghl_id = 'c_a_1';
    results := results || jsonb_build_object('test', 'writer updates a sync fingerprint', 'passed', t = 'fp2', 'detail', t);
    begin
      insert into public.ghl_sync_state (workspace_id, object, ghl_id, fingerprint)
      values (ws_a, 'contact', 'c_a_1', 'dup');
      results := results || jsonb_build_object('test', 'one fingerprint per GHL record', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'one fingerprint per GHL record', 'passed', sqlstate = '23505', 'detail', sqlstate);
    end;
    begin
      insert into public.ghl_sync_state (workspace_id, object, ghl_id, fingerprint)
      values (ws_b, 'contact', 'c_x', 'fp');
      results := results || jsonb_build_object('test', 'A cannot write B sync state', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot write B sync state', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.ghl_sync_state where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B sync state', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.ghl_sync_settings where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B import settings', 'passed', n = 0, 'detail', n);

    -- ---------- viewer of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    select count(*) into n from public.ghl_sync_state where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads own sync state', 'passed', n = 1, 'detail', n);
    begin
      insert into public.ghl_sync_state (workspace_id, object, ghl_id, fingerprint)
      values (ws_a, 'opportunity', 'o_v', 'fp');
      results := results || jsonb_build_object('test', 'viewer cannot write sync state', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot write sync state', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- admin of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_o, 'role', 'authenticated')::text, true);
    insert into public.ghl_sync_settings (workspace_id, enabled, interval_minutes, enabled_by)
    values (ws_a, true, 60, user_o);
    results := results || jsonb_build_object('test', 'admin turns on the automatic import', 'passed', true, 'detail', null);
    begin
      update public.ghl_sync_settings set last_status = 'ok', lock_until = null where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'run state is only written by the functions', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'run state is only written by the functions', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      update public.ghl_sync_settings set interval_minutes = 5 where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'only hourly / 6-hourly / daily', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'only hourly / 6-hourly / daily', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;

    b := public.ghl_sync_claim(ws_a, false);
    results := results || jsonb_build_object('test', 'a due run claims the lock', 'passed', b, 'detail', b);
    b := public.ghl_sync_claim(ws_a, true);
    results := results || jsonb_build_object('test', 'a second run is blocked while one is running', 'passed', not b, 'detail', b);
    perform public.ghl_sync_finish(ws_a, true, '{"contacts":{"created":2}}'::jsonb, '');
    select last_status || ':' || (lock_until is null)::text || ':' || (last_summary -> 'contacts' ->> 'created')
      into t from public.ghl_sync_settings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'finish records the result and frees the lock', 'passed', t = 'ok:true:2', 'detail', t);
    b := public.ghl_sync_claim(ws_a, false);
    results := results || jsonb_build_object('test', 'no automatic run before the interval passes', 'passed', not b, 'detail', b);
    b := public.ghl_sync_claim(ws_a, true);
    results := results || jsonb_build_object('test', '"Import now" runs any time', 'passed', b, 'detail', b);
    perform public.ghl_sync_finish(ws_a, false, '{}'::jsonb, 'GoHighLevel rejected the token');
    select last_status || ':' || coalesce(last_error, '') into t from public.ghl_sync_settings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'a failed run records its error', 'passed', t = 'error:GoHighLevel rejected the token', 'detail', t);
    select count(*) into n from public.audit_log where workspace_id = ws_a and action = 'ghl.auto_import';
    results := results || jsonb_build_object('test', 'each run is in the audit log', 'passed', n = 2, 'detail', n);
    begin
      perform public.ghl_sync_claim(ws_b, true);
      results := results || jsonb_build_object('test', 'A''s admin cannot run B''s import', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'A''s admin cannot run B''s import', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.ghl_sync_finish(ws_b, true, '{}'::jsonb, '');
      results := results || jsonb_build_object('test', 'A''s admin cannot write B''s result', 'passed', false, 'detail', 'done');
    exception when others then
      results := results || jsonb_build_object('test', 'A''s admin cannot write B''s result', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'postgres', true);
    update public.integrations set status = 'not_connected' where workspace_id = ws_a and provider = 'gohighlevel';
    perform set_config('role', 'authenticated', true);
    b := public.ghl_sync_claim(ws_a, true);
    results := results || jsonb_build_object('test', 'no run when GoHighLevel is not connected', 'passed', not b, 'detail', b);

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.ghl_sync_settings;
      results := results || jsonb_build_object('test', 'anon cannot read import settings', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read import settings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      select count(*) into n from public.ghl_sync_state;
      results := results || jsonb_build_object('test', 'anon cannot read sync state', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read sync state', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.ghl_sync_claim(ws_a, true);
      results := results || jsonb_build_object('test', 'anon cannot run the import', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot run the import', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'RLSOK', message = 'rolling back GHL sync RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$sync$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-ghlsync-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-ghlsync-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_ghl_sync_rls_suite();
