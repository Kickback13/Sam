
create or replace function pg_temp.h4a_reports_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $rp$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000005e0';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000005e1';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000005e0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000005e1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000005e1';
  pipe uuid;
  st_new uuid;
  st_won uuid;
  st_lost uuid;
  pipe_b uuid;
  st_b uuid;
  r jsonb;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-rep-rls-admin@rls.test'), (viewer_a, 'h4a-rep-rls-viewer@rls.test'),
                 (admin_b, 'h4a-rep-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'REP RLS A', 'h4a-rep-rls-test-a', 'real_estate', true),
           (ws_b, 'REP RLS B', 'h4a-rep-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');

    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_a, 'Deals', 'acquisition', true) returning id into pipe;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_a, pipe, 'New Deal', 1) returning id into st_new;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, is_won) values (ws_a, pipe, 'Closed', 2, true) returning id into st_won;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, is_lost) values (ws_a, pipe, 'Lost', 3, true) returning id into st_lost;
    insert into public.deals (workspace_id, pipeline_id, stage_id, title, value) values
      (ws_a, pipe, st_new, 'Open 1', 1000000), (ws_a, pipe, st_new, 'Open 2', 500000);
    insert into public.deals (workspace_id, pipeline_id, stage_id, title, value, status, closed_at) values
      (ws_a, pipe, st_won, 'Won', 2000000, 'won', now() - interval '3 days');
    insert into public.deals (workspace_id, pipeline_id, stage_id, title, status, closed_at, lost_reason) values
      (ws_a, pipe, st_lost, 'Lost 1', 'lost', now() - interval '2 days', 'Price too high'),
      (ws_a, pipe, st_lost, 'Lost 2', 'lost', now() - interval '200 days', 'Old');
    update public.deals set closed_at = now() - interval '200 days' where workspace_id = ws_a and title = 'Lost 2';
    update public.deals set closed_at = now() - interval '3 days' where workspace_id = ws_a and title = 'Won';
    insert into public.contacts (workspace_id, first_name) values (ws_a, 'One'), (ws_a, 'Two'), (ws_a, 'Three');
    insert into public.activities (workspace_id, type, subject_type, subject_id, body)
    select ws_a, 'call', 'contact', c.id, 'call' from public.contacts c where c.workspace_id = ws_a limit 2;
    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_b, 'Deals', 'acquisition', true) returning id into pipe_b;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_b, pipe_b, 'New Deal', 1) returning id into st_b;
    insert into public.deals (workspace_id, pipeline_id, stage_id, title, value) values (ws_b, pipe_b, st_b, 'B deal', 9);
    insert into public.contacts (workspace_id, first_name) values (ws_b, 'Bee');

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    r := public.report_summary(ws_a, 30);
    results := results || jsonb_build_object('test', 'a viewer gets the report', 'passed', r is not null, 'detail', null);
    results := results || jsonb_build_object('test', 'open deals per stage',
      'passed', (select (s ->> 'open_count')::int = 2 and (s ->> 'open_value')::numeric = 1500000
                 from jsonb_array_elements(r -> 'stages') s where s ->> 'name' = 'New Deal'),
      'detail', r -> 'stages');
    results := results || jsonb_build_object('test', 'won and lost in the period only',
      'passed', (r -> 'closed' ->> 'won')::int = 1 and (r -> 'closed' ->> 'lost')::int = 1
                and (r -> 'closed' ->> 'won_value')::numeric = 2000000,
      'detail', r -> 'closed');
    results := results || jsonb_build_object('test', 'lost reasons in the period',
      'passed', r -> 'lost_reasons' = '[{"n": 1, "reason": "Price too high"}]'::jsonb, 'detail', r -> 'lost_reasons');
    results := results || jsonb_build_object('test', 'new contacts this period (not B''s)',
      'passed', (select sum((w ->> 'contacts')::int) from jsonb_array_elements(r -> 'weeks') w) = 3, 'detail', null);
    results := results || jsonb_build_object('test', 'calls logged',
      'passed', (select sum((w ->> 'calls')::int) from jsonb_array_elements(r -> 'weeks') w) = 2, 'detail', null);
    results := results || jsonb_build_object('test', 'the period is capped (7–365 days)',
      'passed', (public.report_summary(ws_a, 5000) ->> 'days')::int = 365
                and (public.report_summary(ws_a, 1) ->> 'days')::int = 7, 'detail', null);

    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    begin
      r := public.report_summary(ws_a, 30);
      results := results || jsonb_build_object('test', 'another workspace is refused', 'passed', false, 'detail', 'returned');
    exception when others then
      results := results || jsonb_build_object('test', 'another workspace is refused', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    r := public.report_summary(ws_b, 30);
    results := results || jsonb_build_object('test', 'B sees only B',
      'passed', (select sum((s ->> 'open_count')::int) from jsonb_array_elements(r -> 'stages') s) = 1, 'detail', null);

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      r := public.report_summary(ws_a, 30);
      results := results || jsonb_build_object('test', 'anon cannot run reports', 'passed', false, 'detail', 'returned');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot run reports', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back reports RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$rp$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || coalesce(info, ''), E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-rep-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-rep-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_reports_rls_suite();
