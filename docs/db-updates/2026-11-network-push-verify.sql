
create or replace function pg_temp.h4a_network_push_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $pu$
declare
  results jsonb := '[]'::jsonb;
  staff_a uuid := 'aaaaaaaa-0000-4000-a000-0000000007a0';
  mem_m uuid := 'aaaaaaaa-0000-4000-a000-0000000007a1';
  mem_n uuid := 'aaaaaaaa-0000-4000-a000-0000000007a2';
  outsider uuid := 'bbbbbbbb-0000-4000-a000-0000000007a0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000007a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000007a1';
  k text := repeat('B', 87);
  a text := repeat('a', 22);
  n bigint;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (staff_a, 'h4a-pu-rls-staff@rls.test'), (mem_m, 'h4a-pu-rls-m@rls.test'),
                 (mem_n, 'h4a-pu-rls-n@rls.test'), (outsider, 'h4a-pu-rls-out@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'PU RLS A', 'h4a-pu-rls-test-a', 'real_estate', true),
           (ws_b, 'PU RLS B', 'h4a-pu-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_a, staff_a, 'agent'), (ws_b, outsider, 'admin');
    insert into public.network_members (workspace_id, user_id, display_name, member_type)
    values (ws_a, mem_m, 'Member M', 'investor'), (ws_a, mem_n, 'Member N', 'broker');

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', mem_m, 'role', 'authenticated')::text, true);
    insert into public.network_push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth)
    values (ws_a, mem_m, 'https://push.example/m', k, a);
    results := results || jsonb_build_object('test', 'a member registers their own device', 'passed', true, 'detail', null);
    begin
      insert into public.network_push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth)
      values (ws_a, mem_n, 'https://push.example/forged', k, a);
      results := results || jsonb_build_object('test', 'not someone else''s device', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'not someone else''s device', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.network_push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth)
      values (ws_b, mem_m, 'https://push.example/b', k, a);
      results := results || jsonb_build_object('test', 'not in a community they aren''t in', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'not in a community they aren''t in', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform * from public.network_push_targets(ws_a);
      results := results || jsonb_build_object('test', 'members can''t list devices to notify', 'passed', false, 'detail', 'listed');
    exception when others then
      results := results || jsonb_build_object('test', 'members can''t list devices to notify', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', mem_n, 'role', 'authenticated')::text, true);
    insert into public.network_push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth)
    values (ws_a, mem_n, 'https://push.example/n', k, a);
    select count(*) into n from public.network_push_subscriptions;
    results := results || jsonb_build_object('test', 'members see only their own devices', 'passed', n = 1, 'detail', n);
    begin
      perform public.network_push_forget(ws_a, array['https://push.example/m']);
      results := results || jsonb_build_object('test', 'members can''t drop devices', 'passed', false, 'detail', 'dropped');
    exception when others then
      results := results || jsonb_build_object('test', 'members can''t drop devices', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'role', 'authenticated')::text, true);
    insert into public.network_push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth)
    values (ws_a, staff_a, 'https://push.example/staff', k, a);
    select count(*) into n from public.network_push_targets(ws_a);
    results := results || jsonb_build_object('test', 'the team lists members'' devices (not their own)', 'passed', n = 2, 'detail', n);
    perform set_config('role', 'postgres', true);
    update public.network_members set status = 'removed' where workspace_id = ws_a and user_id = mem_n;
    perform set_config('role', 'authenticated', true);
    select count(*) into n from public.network_push_targets(ws_a);
    results := results || jsonb_build_object('test', 'removed members aren''t notified', 'passed', n = 1, 'detail', n);
    select public.network_push_forget(ws_a, array['https://push.example/m']) into n;
    results := results || jsonb_build_object('test', 'the team drops gone devices', 'passed', n = 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
    begin
      perform * from public.network_push_targets(ws_a);
      results := results || jsonb_build_object('test', 'another workspace can''t notify', 'passed', false, 'detail', 'listed');
    exception when others then
      results := results || jsonb_build_object('test', 'another workspace can''t notify', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.network_push_subscriptions;
      results := results || jsonb_build_object('test', 'anon sees no devices', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon sees no devices', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back network push RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$pu$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || coalesce(info, ''), E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-pu-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-pu-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_network_push_rls_suite();
