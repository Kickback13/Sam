
create or replace function pg_temp.h4a_spanish_booking_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $sb$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000009b0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000009b1';
  slug_a text := 'h4a-esbk-rls-test-a';
  slots timestamptz[];
  b uuid;
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (admin_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'h4a-esbk-rls-admin@rls.test', '', now(), '{}', '{}', now(), now());
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'ESBK RLS A', slug_a, 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_a, admin_a, 'admin');
    insert into public.booking_settings (workspace_id, enabled, host_user_id, min_notice_hours, max_days_ahead, hours)
    values (ws_a, false, admin_a, 0, 14,
            '{"sun":[["00:00","23:30"]],"mon":[["00:00","23:30"]],"tue":[["00:00","23:30"]],"wed":[["00:00","23:30"]],"thu":[["00:00","23:30"]],"fri":[["00:00","23:30"]],"sat":[["00:00","23:30"]]}');
    insert into public.contacts (workspace_id, first_name, emails, language, created_by)
    values (ws_a, 'Known', '[{"value": "known@rls.test", "is_primary": true}]', 'en', admin_a);

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      perform * from public.booking_public_book(slug_a, now() + interval '2 days', 'Ana Prueba', 'ana@rls.test', null, null, null, 'es');
      results := results || jsonb_build_object('test', 'no Spanish booking while the page is off', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'no Spanish booking while the page is off', 'passed', sqlstate = 'PT404', 'detail', sqlstate);
    end;

    perform set_config('role', 'postgres', true);
    update public.booking_settings set enabled = true where workspace_id = ws_a;
    perform set_config('role', 'anon', true);
    select array_agg(s.starts_at order by s.starts_at) into slots
    from (select x.starts_at from public.booking_public_slots(slug_a) x order by x.starts_at limit 6) s;
    results := results || jsonb_build_object('test', 'the page has open slots', 'passed', coalesce(array_length(slots, 1), 0) >= 5, 'detail', array_length(slots, 1));

    begin
      perform * from public.booking_public_book(slug_a, slots[1], 'Ana Prueba', 'ana@rls.test', null, null, null, 'fr');
      results := results || jsonb_build_object('test', 'an unknown language is refused', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'an unknown language is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    begin
      perform * from public.booking_public_book(slug_a, slots[1] + interval '7 minutes', 'Ana Prueba', 'ana@rls.test', null, null, null, 'es');
      results := results || jsonb_build_object('test', 'an off-grid time is refused in Spanish too', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'an off-grid time is refused in Spanish too', 'passed', sqlstate = 'PT409', 'detail', sqlstate);
    end;

    select x.booking_id into b from public.booking_public_book(slug_a, slots[1], 'Ana Prueba', 'ana@rls.test', null, null, null, 'es') x;
    perform set_config('role', 'postgres', true);
    select c.language into t from public.contacts c join public.bookings k on k.contact_id = c.id where k.id = b;
    results := results || jsonb_build_object('test', 'a Spanish booking marks the new contact Spanish', 'passed', t = 'es', 'detail', t);
    select count(*) into n from public.bookings where id = b and source = 'booking_page' and status = 'booked';
    results := results || jsonb_build_object('test', 'the Spanish booking is a normal booking', 'passed', n = 1, 'detail', n);

    perform set_config('role', 'anon', true);
    select x.booking_id into b from public.booking_public_book(slug_a, slots[2], 'Known Person', 'known@rls.test', null, null, null, 'es') x;
    perform set_config('role', 'postgres', true);
    select c.language into t from public.contacts c join public.bookings k on k.contact_id = c.id where k.id = b;
    results := results || jsonb_build_object('test', 'an existing contact keeps the team''s language', 'passed', t = 'en', 'detail', t);

    perform set_config('role', 'anon', true);
    select x.booking_id into b from public.booking_public_book(slug_a, slots[3], 'Eddie Test', 'eddie@rls.test', null, null, null, 'en') x;
    perform set_config('role', 'postgres', true);
    select c.language into t from public.contacts c join public.bookings k on k.contact_id = c.id where k.id = b;
    results := results || jsonb_build_object('test', 'an English booking leaves the default', 'passed', t = 'en', 'detail', t);

    perform set_config('role', 'anon', true);
    select x.booking_id into b from public.booking_public_book(slug_a, slots[4], 'Old Path', 'old@rls.test', null, null, null) x;
    results := results || jsonb_build_object('test', 'the 7-argument booking still works', 'passed', b is not null, 'detail', b);

    begin
      select count(*) into n from public.contacts;
      results := results || jsonb_build_object('test', 'anon still reads no contacts', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon still reads no contacts', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back Spanish booking RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$sb$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-esbk-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-esbk-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_spanish_booking_rls_suite();
