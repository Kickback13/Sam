-- =============================================================================
-- Housing4All Track (Phase 3B) RLS suite: licensed property data (RentCast).
--
-- Throwaway users/workspaces in a subtransaction that is ALWAYS rolled back
-- (Vault writes included), impersonation through `authenticated` / `anon`.
-- Safe on hosted after the migration:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_property_data_rls.sql
--
-- Covers: only owners/admins store or remove the key; it lives encrypted in
-- Vault, never in a column; writers get the key only while this month's
-- requests are under the limit (the cost guard), viewers never; another
-- workspace gets nothing; pulls are isolated and authored by the caller;
-- anon can call nothing.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_property_data_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_property_data_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $pd$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000003b0';
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000003b1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000003b2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000003b0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000003b1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000003b1';
  prop_a uuid;
  prop_b uuid;
  fake_key text := 'rc-test-key-0123456789abcdef';
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-pd-rls-admin@rls.test'), (agent_a, 'h4a-pd-rls-agent@rls.test'),
                 (viewer_a, 'h4a-pd-rls-viewer@rls.test'), (admin_b, 'h4a-pd-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'PD RLS A', 'h4a-pd-rls-test-a', 'real_estate', true),
           (ws_b, 'PD RLS B', 'h4a-pd-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');
    insert into public.properties (workspace_id, address, zip, units) values (ws_a, '1 Test St', '92104', 24) returning id into prop_a;
    insert into public.properties (workspace_id, address, zip, units) values (ws_b, '2 Test St', '92104', 8) returning id into prop_b;
    insert into public.property_data_pulls (workspace_id, property_id, kind, status, fetched_by)
    values (ws_b, prop_b, 'record', 'found', admin_b);

    -- ---------- agent: cannot connect ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      perform public.data_api_save_key(ws_a, fake_key, 10);
      results := results || jsonb_build_object('test', 'agent cannot connect RentCast', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot connect RentCast', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform * from public.data_api_claim(ws_a);
      results := results || jsonb_build_object('test', 'no key while not connected', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'no key while not connected', 'passed', sqlstate = 'P0002', 'detail', sqlstate);
    end;

    -- ---------- admin connects with a limit of 2 ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    begin
      perform public.data_api_save_key(ws_a, 'short', 2);
      results := results || jsonb_build_object('test', 'a malformed key is refused', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'a malformed key is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    perform public.data_api_save_key(ws_a, fake_key, 2);
    select used::text || '/' || monthly_limit::text || '/' || connected::text into t from public.data_api_usage(ws_a);
    results := results || jsonb_build_object('test', 'usage shows 0 of 2, connected', 'passed', t = '0/2/true', 'detail', t);

    perform set_config('role', 'postgres', true);
    select count(*) into n from vault.secrets where name = 'data_api_key:' || ws_a::text;
    results := results || jsonb_build_object('test', 'the key is stored in Vault', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.integrations where workspace_id = ws_a and config::text like '%' || fake_key || '%';
    results := results || jsonb_build_object('test', 'the key is in no table column', 'passed', n = 0, 'detail', n);
    perform set_config('role', 'authenticated', true);

    -- ---------- agent fetches: key while under the limit ----------
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    select api_key into t from public.data_api_claim(ws_a);
    results := results || jsonb_build_object('test', 'a writer gets the key for one request', 'passed', t = fake_key, 'detail', null);
    insert into public.property_data_pulls (workspace_id, property_id, kind, status) values (ws_a, prop_a, 'record', 'found');
    insert into public.property_data_pulls (workspace_id, property_id, kind, status) values (ws_a, prop_a, 'value', 'error');
    insert into public.property_data_pulls (workspace_id, property_id, kind, status) values (ws_a, prop_a, 'rent', 'not_found');
    select used into n from public.data_api_usage(ws_a);
    results := results || jsonb_build_object('test', 'errors don''t count; answers and misses do', 'passed', n = 2, 'detail', n);
    begin
      perform * from public.data_api_claim(ws_a);
      results := results || jsonb_build_object('test', 'the monthly limit stops further requests', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'the monthly limit stops further requests', 'passed', sqlstate = 'P0001', 'detail', sqlstate);
    end;
    begin
      insert into public.property_data_pulls (workspace_id, property_id, kind, status, fetched_by)
      values (ws_a, prop_a, 'record', 'found', admin_a);
      results := results || jsonb_build_object('test', 'pulls are authored by the caller', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'pulls are authored by the caller', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.property_data_pulls (workspace_id, property_id, kind, status) values (ws_b, prop_b, 'record', 'found');
      results := results || jsonb_build_object('test', 'A cannot write B pulls', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot write B pulls', 'passed', sqlstate in ('42501', '23503'), 'detail', sqlstate);
    end;
    select count(*) into n from public.property_data_pulls where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B pulls', 'passed', n = 0, 'detail', n);
    begin
      perform public.data_api_save_key(ws_a, null, 100);
      results := results || jsonb_build_object('test', 'agent cannot raise the limit', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot raise the limit', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- admin raises the limit without re-entering the key ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    perform public.data_api_save_key(ws_a, null, 5);
    select monthly_limit into n from public.data_api_usage(ws_a);
    results := results || jsonb_build_object('test', 'admin changes only the limit', 'passed', n = 5, 'detail', n);

    -- ---------- viewer ----------
    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.property_data_pulls where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads the fetched data', 'passed', n = 3, 'detail', n);
    begin
      perform * from public.data_api_claim(ws_a);
      results := results || jsonb_build_object('test', 'viewer never gets the key', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer never gets the key', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- another workspace's admin ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    begin
      perform * from public.data_api_claim(ws_a);
      results := results || jsonb_build_object('test', 'B cannot use A''s key', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'B cannot use A''s key', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.data_api_usage(ws_a);
    results := results || jsonb_build_object('test', 'B cannot see A''s usage', 'passed', n = 0, 'detail', n);

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      perform * from public.data_api_claim(ws_a);
      results := results || jsonb_build_object('test', 'anon cannot get the key', 'passed', false, 'detail', 'claimed');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot get the key', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      select count(*) into n from public.property_data_pulls;
      results := results || jsonb_build_object('test', 'anon cannot read pulls', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read pulls', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- admin disconnects ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    perform public.data_api_disconnect(ws_a);
    perform set_config('role', 'postgres', true);
    select count(*) into n from vault.secrets where name = 'data_api_key:' || ws_a::text;
    results := results || jsonb_build_object('test', 'disconnect deletes the key', 'passed', n = 0, 'detail', n);

    raise exception using errcode = 'RLSOK', message = 'rolling back property data RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$pd$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-pd-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-pd-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_property_data_rls_suite();
