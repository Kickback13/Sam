-- =============================================================================
-- Housing4All Track (Phase 3A) RLS suite: property analysis tables
-- (h4a_underwriting, h4a_comps).
--
-- Same pattern as h4a_rls.sql: throwaway users/workspaces created in a
-- subtransaction that is ALWAYS rolled back, then impersonation through the
-- `authenticated` / `anon` roles + JWT claims (exactly how PostgREST runs).
-- Safe to run on the hosted project after the migration is applied:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_analysis_rls.sql
--
-- Covers: workspace isolation both ways; writers (agent) create and edit;
-- viewers read only; anon gets nothing; rows can't point at another
-- workspace's property; comps require a source, a date, and a price (sale) or
-- rent (rent); inputs must be a JSON object; deleting a property removes its
-- analysis.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_analysis_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_analysis_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $ana$
declare
  results jsonb := '[]'::jsonb;
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000003a1';
  user_v uuid := 'aaaaaaaa-0000-4000-a000-0000000003a3';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000003b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000003a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000003b1';
  prop_a uuid;
  prop_b uuid;
  uw_a uuid;
  uw_b uuid;
  comp_a uuid;
  n bigint;
  t text;
  v numeric;
begin
  begin -- fixture subtransaction (always rolled back)

    -- ---------- fixtures (as table owner) ----------
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ana-rls-a@rls.test', '', now(), '{}', '{"full_name":"RLS Agent"}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ana-rls-v@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-ana-rls-b@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'H4A Analysis RLS A', 'h4a-ana-rls-test-a', 'real_estate', true),
           (ws_b, 'H4A Analysis RLS B', 'h4a-ana-rls-test-b', 'real_estate', true);

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_a, 'agent'), (ws_a, user_v, 'viewer'), (ws_b, user_b, 'admin');

    insert into public.properties (workspace_id, address, zip, units)
    values (ws_a, '1 Alpha St', '92104', 8) returning id into prop_a;
    insert into public.properties (workspace_id, address, zip, units)
    values (ws_b, '1 Bravo St', '91910', 4) returning id into prop_b;

    insert into public.h4a_underwriting (workspace_id, property_id, name, inputs)
    values (ws_b, prop_b, 'Bravo scenario', '{"price": 1000000}') returning id into uw_b;
    insert into public.h4a_comps (workspace_id, property_id, kind, address, units, price, source_label, as_of)
    values (ws_b, prop_b, 'sale', '2 Bravo St', 4, 900000, 'Bravo OM', current_date);

    -- ---------- impersonate A (agent = writer in workspace A) ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    foreach t in array array['h4a_underwriting', 'h4a_comps'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_b;
      results := results || jsonb_build_object('test', 'A cannot read B ' || t, 'passed', n = 0, 'detail', n);
    end loop;

    insert into public.h4a_underwriting (workspace_id, property_id, name, inputs, input_sources)
    values (ws_a, prop_a, 'Asking price', '{"price": 2000000, "units": 8}',
            '{"price": {"source": "manual", "label": "Entered by RLS Agent"}}')
    returning id into uw_a;
    results := results || jsonb_build_object('test', 'agent saves a scenario', 'passed', uw_a is not null, 'detail', uw_a);
    select created_by::text into t from public.h4a_underwriting where id = uw_a;
    results := results || jsonb_build_object('test', 'created_by is the signed-in user', 'passed', t = user_a::text, 'detail', t);

    update public.h4a_underwriting set name = 'Offer' where id = uw_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'agent edits own workspace scenario', 'passed', n = 1, 'detail', n);

    insert into public.h4a_comps (workspace_id, property_id, kind, address, units, price, source_label, as_of)
    values (ws_a, prop_a, 'sale', '3 Alpha St', 10, 2500000, 'Broker OM 10/2026', current_date)
    returning id into comp_a;
    select price_per_unit into v from public.h4a_comps where id = comp_a;
    results := results || jsonb_build_object('test', 'sale comp price per unit is computed', 'passed', v = 250000, 'detail', v);

    begin
      insert into public.h4a_underwriting (workspace_id, property_id, name) values (ws_b, prop_b, 'sneaky');
      results := results || jsonb_build_object('test', 'A cannot write into B', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot write into B', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_underwriting (workspace_id, property_id, name) values (ws_a, prop_b, 'cross');
      results := results || jsonb_build_object('test', 'a scenario can''t point at another workspace''s property', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'a scenario can''t point at another workspace''s property', 'passed', sqlstate = '23503', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_comps (workspace_id, property_id, kind, address, units, source_label, as_of)
      values (ws_a, prop_a, 'sale', '4 Alpha St', 6, 'x', current_date);
      results := results || jsonb_build_object('test', 'a sale comp needs a price', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'a sale comp needs a price', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_comps (workspace_id, property_id, kind, address, unit_type, source_label, as_of)
      values (ws_a, prop_a, 'rent', '5 Alpha St', '2BR', 'x', current_date);
      results := results || jsonb_build_object('test', 'a rent comp needs a rent', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'a rent comp needs a rent', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_comps (workspace_id, property_id, kind, address, monthly_rent, as_of)
      values (ws_a, prop_a, 'rent', '6 Alpha St', 2400, current_date);
      results := results || jsonb_build_object('test', 'a comp needs a source', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'a comp needs a source', 'passed', sqlstate = '23502', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_comps (workspace_id, property_id, kind, address, monthly_rent, source_label)
      values (ws_a, prop_a, 'rent', '7 Alpha St', 2400, 'x');
      results := results || jsonb_build_object('test', 'a comp needs an as-of date', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'a comp needs an as-of date', 'passed', sqlstate = '23502', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_underwriting (workspace_id, property_id, name, inputs) values (ws_a, prop_a, 'bad', '[1, 2]');
      results := results || jsonb_build_object('test', 'scenario inputs must be a JSON object', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'scenario inputs must be a JSON object', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;

    -- ---------- impersonate B (admin in workspace B) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    update public.h4a_underwriting set name = 'hijacked' where id = uw_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot edit A''s scenario', 'passed', n = 0, 'detail', n);
    delete from public.h4a_comps where id = comp_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot delete A''s comp', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.h4a_underwriting where id = uw_b;
    results := results || jsonb_build_object('test', 'B reads its own scenario', 'passed', n = 1, 'detail', n);

    -- ---------- impersonate the viewer in A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    select count(*) into n from public.h4a_underwriting where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads A scenarios', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.h4a_comps where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads A comps', 'passed', n = 1, 'detail', n);
    begin
      insert into public.h4a_underwriting (workspace_id, property_id, name) values (ws_a, prop_a, 'viewer try');
      results := results || jsonb_build_object('test', 'viewer cannot create a scenario', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot create a scenario', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    update public.h4a_underwriting set name = 'viewer edit' where id = uw_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'viewer cannot edit a scenario', 'passed', n = 0, 'detail', n);
    delete from public.h4a_comps where id = comp_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'viewer cannot delete a comp', 'passed', n = 0, 'detail', n);

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    foreach t in array array['h4a_underwriting', 'h4a_comps'] loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', false, 'detail', n);
      exception when others then
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;

    -- ---------- back to the owner: cascade ----------
    perform set_config('role', 'postgres', true);
    delete from public.properties where id = prop_a;
    select count(*) into n from public.h4a_underwriting where property_id = prop_a;
    results := results || jsonb_build_object('test', 'deleting a property removes its scenarios', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.h4a_comps where property_id = prop_a;
    results := results || jsonb_build_object('test', 'deleting a property removes its comps', 'passed', n = 0, 'detail', n);

    -- ---------- discard all fixtures ----------
    raise exception using errcode = 'RLSOK', message = 'rolling back H4A analysis RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null; -- expected: fixtures rolled back
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$ana$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-ana-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-ana-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_analysis_rls_suite();
