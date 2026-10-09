-- =============================================================================
-- RLS isolation suite.
--
-- Creates two throwaway users/workspaces, impersonates each user through the
-- `authenticated` role + JWT claims (exactly how PostgREST runs queries), and
-- asserts what each user can and cannot read/write. All fixture data lives in a
-- subtransaction that is ALWAYS rolled back, so this is safe to run against the
-- hosted project. Results are returned as rows (n, test, passed, detail).
--
-- Run locally:   psql "$DB_URL" -f supabase/tests/rls_isolation.sql
-- Run on hosted: node scripts/rls-hosted-sql.mjs > /tmp/rls.sql and paste into
--                the Supabase MCP `execute_sql` tool. The hosted variant drops the
--                block between @destructive markers (the connector pauses DELETE
--                statements for manual confirmation); those policies are verified
--                locally against the identical schema.
-- =============================================================================

create or replace function pg_temp.rls_isolation_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $rls$
declare
  results jsonb := '[]'::jsonb;
  user_a uuid := 'aaaaaaaa-0000-4000-a000-000000000001';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-000000000002';
  user_v uuid := 'cccccccc-0000-4000-a000-000000000003';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-000000000001';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-000000000002';
  pipe_a uuid; pipe_b uuid; stage_a uuid; stage_b uuid;
  contact_a uuid; contact_b uuid; company_b uuid; deal_b uuid; invite_b text;
  n bigint;
  r record;
begin
  begin -- fixture subtransaction (always rolled back)

    -- ---------- fixtures (as table owner) ----------
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-v@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'RLS Test A', 'rls-test-a', 'real_estate', true),
           (ws_b, 'RLS Test B', 'rls-test-b', 'construction', true);

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_a, 'agent'), (ws_b, user_b, 'admin'), (ws_a, user_v, 'viewer');

    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_a, 'P-A', 'acquisition', true) returning id into pipe_a;
    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_b, 'P-B', 'construction_project', true) returning id into pipe_b;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_a, pipe_a, 'S-A', 1) returning id into stage_a;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_b, pipe_b, 'S-B', 1) returning id into stage_b;

    insert into public.contacts (workspace_id, first_name, last_name) values (ws_a, 'Alpha', 'Tenant-A') returning id into contact_a;
    insert into public.contacts (workspace_id, first_name, last_name) values (ws_b, 'Bravo', 'Tenant-B') returning id into contact_b;
    insert into public.companies (workspace_id, name) values (ws_b, 'Bravo Co') returning id into company_b;
    insert into public.properties (workspace_id, address) values (ws_b, '1 Bravo St');
    insert into public.deals (workspace_id, pipeline_id, stage_id, title) values (ws_b, pipe_b, stage_b, 'Bravo deal') returning id into deal_b;
    insert into public.tasks (workspace_id, title) values (ws_b, 'Bravo task');
    insert into public.invites (workspace_id, email, role, invited_by) values (ws_b, 'someone-else@rls.test', 'agent', user_b) returning token into invite_b;
    insert into public.audit_log (workspace_id, actor_id, action, entity_type) values (ws_a, user_a, 'test', 'contact');

    -- ---------- impersonate user A (agent in workspace A) ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    select count(*) into n from public.contacts where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'A reads own workspace contacts', 'passed', n = 1, 'detail', n);

    for r in select t from unnest(array['contacts','companies','properties','deals','tasks','pipelines','pipeline_stages','deal_stage_history','activities','integrations','imports']) t loop
      execute format('select count(*) from public.%I where workspace_id = $1', r.t) into n using ws_b;
      results := results || jsonb_build_object('test', 'A cannot read B ' || r.t, 'passed', n = 0, 'detail', n);
    end loop;

    select count(*) into n from public.workspaces where id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B workspace row', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.workspace_members where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B memberships', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.profiles where id = user_b;
    results := results || jsonb_build_object('test', 'A cannot read B user profile', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.invites where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B invites', 'passed', n = 0, 'detail', n);

    begin
      insert into public.contacts (workspace_id, first_name) values (ws_b, 'Intruder');
      results := results || jsonb_build_object('test', 'A cannot insert contact into B', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot insert contact into B', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.deals (workspace_id, pipeline_id, stage_id, title) values (ws_b, pipe_b, stage_b, 'Intruder deal');
      results := results || jsonb_build_object('test', 'A cannot insert deal into B', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot insert deal into B', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    update public.contacts set first_name = 'Hacked' where id = contact_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot update B contact', 'passed', n = 0, 'detail', n);

    update public.deals set stage_id = stage_b where id = deal_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot move B deal', 'passed', n = 0, 'detail', n);

    -- @destructive-begin
    delete from public.contacts where id = contact_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot delete B contact', 'passed', n = 0, 'detail', n);
    -- @destructive-end

    begin
      update public.contacts set workspace_id = ws_b where id = contact_a;
      results := results || jsonb_build_object('test', 'A cannot move own contact into B', 'passed', false, 'detail', 'update succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot move own contact into B', 'passed', sqlstate in ('42501', '23503'), 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.contacts (workspace_id, first_name, company_id) values (ws_a, 'Cross', company_b);
      results := results || jsonb_build_object('test', 'A cannot link B company from A contact', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot link B company from A contact', 'passed', sqlstate = '23503', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.activities (workspace_id, type, subject_type, subject_id, body) values (ws_a, 'note', 'contact', contact_b, 'x');
      results := results || jsonb_build_object('test', 'A cannot attach activity to B contact', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot attach activity to B contact', 'passed', sqlstate = '23503', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.workspace_members (workspace_id, user_id, role) values (ws_b, user_a, 'owner');
      results := results || jsonb_build_object('test', 'A cannot add self to B', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot add self to B', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      perform public.accept_invite(invite_b);
      results := results || jsonb_build_object('test', 'A cannot accept invite bound to another email', 'passed', false, 'detail', 'accepted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot accept invite bound to another email', 'passed', true, 'detail', sqlstate || ' ' || sqlerrm);
    end;

    select count(*) into n from public.global_search(ws_b, 'bravo', 10);
    results := results || jsonb_build_object('test', 'A global_search over B returns nothing', 'passed', n = 0, 'detail', n);

    select count(*) into n from public.global_search(ws_a, 'alpha', 10);
    results := results || jsonb_build_object('test', 'A global_search over A finds own contact', 'passed', n = 1, 'detail', n);

    -- agent limits inside own workspace
    update public.pipeline_stages set name = 'Renamed' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'Agent cannot edit pipeline stages', 'passed', n = 0, 'detail', n);

    select count(*) into n from public.audit_log where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'Agent cannot read audit log', 'passed', n = 0, 'detail', n);

    begin
      insert into public.activities (workspace_id, type, subject_type, subject_id, body) values (ws_a, 'stage_change', 'contact', contact_a, 'forged');
      results := results || jsonb_build_object('test', 'Users cannot forge stage_change activities', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'Users cannot forge stage_change activities', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.deal_stage_history (workspace_id, deal_id) values (ws_a, gen_random_uuid());
      results := results || jsonb_build_object('test', 'Users cannot write stage history directly', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'Users cannot write stage history directly', 'passed', sqlstate in ('42501', '23503'), 'detail', sqlstate || ' ' || sqlerrm);
    end;

    insert into public.contacts (workspace_id, first_name) values (ws_a, 'Allowed');
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'Agent can create contact in own workspace', 'passed', n = 1, 'detail', n);

    -- ---------- impersonate viewer V (viewer in workspace A) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);

    select count(*) into n from public.contacts where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'Viewer reads own workspace', 'passed', n >= 1, 'detail', n);

    begin
      insert into public.contacts (workspace_id, first_name) values (ws_a, 'Viewer write');
      results := results || jsonb_build_object('test', 'Viewer cannot create contacts', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'Viewer cannot create contacts', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    update public.contacts set first_name = 'Viewer edit' where id = contact_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'Viewer cannot update contacts', 'passed', n = 0, 'detail', n);

    -- ---------- impersonate user B (admin in workspace B) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);

    select count(*) into n from public.contacts where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot read A contacts', 'passed', n = 0, 'detail', n);

    select count(*) into n from public.contacts where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'B reads own workspace contacts', 'passed', n = 1, 'detail', n);

    update public.workspaces set name = 'Hacked A' where id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B admin cannot rename A workspace', 'passed', n = 0, 'detail', n);

    update public.pipeline_stages set name = 'Admin rename' where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'Admin can edit own pipeline stages', 'passed', n = 1, 'detail', n);

    begin
      insert into public.invites (workspace_id, email, role, invited_by) values (ws_a, 'x@rls.test', 'admin', user_b);
      results := results || jsonb_build_object('test', 'B admin cannot invite into A', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'B admin cannot invite into A', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.contacts;
      results := results || jsonb_build_object('test', 'anon cannot read contacts', 'passed', n = 0, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read contacts', 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
    end;

    -- ---------- discard all fixtures ----------
    raise exception using errcode = 'RLSOK', message = 'rolling back RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null; -- expected: fixtures rolled back
  end;

  return query
  select e.ord, e.val ->> 'test', (e.val ->> 'passed')::boolean, e.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as e(val, ord)
  order by e.ord;
end;
$rls$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.rls_isolation_suite();
