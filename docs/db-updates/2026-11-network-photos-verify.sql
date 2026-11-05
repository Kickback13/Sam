
create or replace function pg_temp.h4a_network_photos_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $np$
declare
  results jsonb := '[]'::jsonb;
  staff_a uuid := 'aaaaaaaa-0000-4000-a000-0000000006f0';
  mem_m uuid := 'aaaaaaaa-0000-4000-a000-0000000006f1';
  mem_n uuid := 'aaaaaaaa-0000-4000-a000-0000000006f2';
  outsider uuid := 'bbbbbbbb-0000-4000-a000-0000000006f0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000006f1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000006f1';
  p_m text;
  p_n text;
  n bigint;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (staff_a, 'h4a-np-rls-staff@rls.test'), (mem_m, 'h4a-np-rls-m@rls.test'),
                 (mem_n, 'h4a-np-rls-n@rls.test'), (outsider, 'h4a-np-rls-out@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'NP RLS A', 'h4a-np-rls-test-a', 'real_estate', true),
           (ws_b, 'NP RLS B', 'h4a-np-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_a, staff_a, 'agent'), (ws_b, outsider, 'admin');
    insert into public.network_members (workspace_id, user_id, display_name, member_type)
    values (ws_a, mem_m, 'Member M', 'investor'), (ws_a, mem_n, 'Member N', 'broker');
    p_m := ws_a::text || '/' || mem_m::text || '/' || gen_random_uuid()::text || '.jpg';
    p_n := ws_a::text || '/' || mem_n::text || '/' || gen_random_uuid()::text || '.png';

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', mem_m, 'role', 'authenticated')::text, true);
    insert into storage.objects (bucket_id, name, owner_id) values ('network-photos', p_m, mem_m::text);
    results := results || jsonb_build_object('test', 'a member uploads to their own folder', 'passed', true, 'detail', null);
    begin
      insert into storage.objects (bucket_id, name, owner_id)
      values ('network-photos', ws_a::text || '/' || mem_n::text || '/' || gen_random_uuid()::text || '.jpg', mem_m::text);
      results := results || jsonb_build_object('test', 'not into someone else''s folder', 'passed', false, 'detail', 'uploaded');
    exception when others then
      results := results || jsonb_build_object('test', 'not into someone else''s folder', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id)
      values ('network-photos', ws_b::text || '/' || mem_m::text || '/' || gen_random_uuid()::text || '.jpg', mem_m::text);
      results := results || jsonb_build_object('test', 'not into a community they aren''t in', 'passed', false, 'detail', 'uploaded');
    exception when others then
      results := results || jsonb_build_object('test', 'not into a community they aren''t in', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id)
      values ('network-photos', ws_a::text || '/' || mem_m::text || '/evil.svg', mem_m::text);
      results := results || jsonb_build_object('test', 'only photo file names', 'passed', false, 'detail', 'uploaded');
    exception when others then
      results := results || jsonb_build_object('test', 'only photo file names', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    insert into public.network_posts (workspace_id, title, photo_paths) values (ws_a, 'With photo', array[p_m]);
    results := results || jsonb_build_object('test', 'a post carries the poster''s own photo', 'passed', true, 'detail', null);
    begin
      insert into public.network_posts (workspace_id, title, photo_paths)
      values (ws_a, 'Missing', array[ws_a::text || '/' || mem_m::text || '/' || gen_random_uuid()::text || '.jpg']);
      results := results || jsonb_build_object('test', 'a photo that was never uploaded is refused', 'passed', false, 'detail', 'posted');
    exception when others then
      results := results || jsonb_build_object('test', 'a photo that was never uploaded is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    begin
      insert into public.network_posts (workspace_id, title, photo_paths)
      values (ws_a, 'Five', array[p_m, p_m, p_m, p_m, p_m]);
      results := results || jsonb_build_object('test', 'at most 4 photos', 'passed', false, 'detail', 'posted');
    exception when others then
      results := results || jsonb_build_object('test', 'at most 4 photos', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', mem_n, 'role', 'authenticated')::text, true);
    insert into storage.objects (bucket_id, name, owner_id) values ('network-photos', p_n, mem_n::text);
    begin
      insert into public.network_posts (workspace_id, title, photo_paths) values (ws_a, 'Borrowed', array[p_m]);
      results := results || jsonb_build_object('test', 'someone else''s photo is refused', 'passed', false, 'detail', 'posted');
    exception when others then
      results := results || jsonb_build_object('test', 'someone else''s photo is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    select count(*) into n from storage.objects where bucket_id = 'network-photos' and name = p_m;
    results := results || jsonb_build_object('test', 'community members see the photos', 'passed', n = 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'role', 'authenticated')::text, true);
    select count(*) into n from storage.objects where bucket_id = 'network-photos' and name in (p_m, p_n);
    results := results || jsonb_build_object('test', 'the team sees the photos', 'passed', n = 2, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
    select count(*) into n from storage.objects where bucket_id = 'network-photos' and name in (p_m, p_n);
    results := results || jsonb_build_object('test', 'another workspace sees nothing', 'passed', n = 0, 'detail', n);

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from storage.objects where bucket_id = 'network-photos';
      results := results || jsonb_build_object('test', 'anon sees nothing', 'passed', n = 0, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon sees nothing', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back network photos RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$np$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || coalesce(info, ''), E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-np-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-np-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_network_photos_rls_suite();
