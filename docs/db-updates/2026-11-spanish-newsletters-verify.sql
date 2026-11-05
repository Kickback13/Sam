
create or replace function pg_temp.h4a_spanish_newsletters_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $sn$
declare
  results jsonb := '[]'::jsonb;
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-000000000ae1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-000000000ae2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-000000000ae0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-000000000ae1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-000000000ae1';
  nl uuid;
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (agent_a, 'h4a-esnl-rls-agent@rls.test'), (viewer_a, 'h4a-esnl-rls-viewer@rls.test'),
                 (admin_b, 'h4a-esnl-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'ESNL RLS A', 'h4a-esnl-rls-test-a', 'real_estate', true),
           (ws_b, 'ESNL RLS B', 'h4a-esnl-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    insert into public.newsletters (workspace_id, subject, body) values (ws_a, 'Deals', 'Hello') returning id into nl;
    update public.newsletters set subject_es = 'Ofertas', preheader_es = 'Tres edificios', body_es = 'Hola' where id = nl;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'a writer saves a Spanish version', 'passed', n = 1, 'detail', n);
    begin
      update public.newsletters set subject_es = null where id = nl;
      results := results || jsonb_build_object('test', 'a Spanish message needs a Spanish subject', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'a Spanish message needs a Spanish subject', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      update public.newsletters set subject_es = null, body_es = null where id = nl;
      results := results || jsonb_build_object('test', 'a Spanish preview line needs a Spanish message', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'a Spanish preview line needs a Spanish message', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    update public.newsletters set subject_es = null, preheader_es = null, body_es = null where id = nl;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'the Spanish version can be removed', 'passed', n = 1, 'detail', n);
    update public.newsletters set subject_es = 'Ofertas', body_es = 'Hola' where id = nl;

    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    select body_es into t from public.newsletters where id = nl;
    results := results || jsonb_build_object('test', 'a viewer reads the Spanish version', 'passed', t = 'Hola', 'detail', t);
    update public.newsletters set body_es = 'cambiado' where id = nl;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'a viewer cannot change the Spanish version', 'passed', n = 0, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.newsletters where id = nl;
    results := results || jsonb_build_object('test', 'B cannot read A''s newsletter', 'passed', n = 0, 'detail', n);
    update public.newsletters set body_es = 'cambiado' where id = nl;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot change A''s Spanish version', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    insert into public.newsletter_sends (workspace_id, newsletter_id, email, status)
    values (ws_a, nl, 'en@rls.test', 'queued');
    insert into public.newsletter_sends (workspace_id, newsletter_id, email, status, language)
    values (ws_a, nl, 'es@rls.test', 'queued', 'es');
    select string_agg(language, ',' order by email) into t from public.newsletter_sends where newsletter_id = nl;
    results := results || jsonb_build_object('test', 'send rows record the language (English by default)', 'passed', t = 'en,es', 'detail', t);
    begin
      insert into public.newsletter_sends (workspace_id, newsletter_id, email, status, language)
      values (ws_a, nl, 'fr@rls.test', 'queued', 'fr');
      results := results || jsonb_build_object('test', 'only English or Spanish', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'only English or Spanish', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      update public.newsletter_sends set language = 'en' where newsletter_id = nl and email = 'es@rls.test';
      results := results || jsonb_build_object('test', 'a send row''s language can''t be changed', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'a send row''s language can''t be changed', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.newsletters;
      results := results || jsonb_build_object('test', 'anon cannot read newsletters', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read newsletters', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back Spanish newsletter RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$sn$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-esnl-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-esnl-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_spanish_newsletters_rls_suite();
