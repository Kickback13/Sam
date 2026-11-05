
create or replace function pg_temp.h4a_booking_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $bk$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004c0';
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004c1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004c2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000004c0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000004c1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000004c1';
  slug_a text := 'h4a-bk-rls-test-a';
  ck text := repeat('ab', 32);
  slot1 timestamptz;
  slot2 timestamptz;
  slot3 timestamptz;
  b1 uuid;
  token text;
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-bk-rls-admin@rls.test'), (agent_a, 'h4a-bk-rls-agent@rls.test'),
                 (viewer_a, 'h4a-bk-rls-viewer@rls.test'), (admin_b, 'h4a-bk-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'BK RLS A', slug_a, 'real_estate', true),
           (ws_b, 'BK RLS B', 'h4a-bk-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_public_page(slug_a);
    results := results || jsonb_build_object('test', 'no page before it is set up', 'passed', n = 0, 'detail', n);

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.booking_settings (workspace_id, enabled) values (ws_a, true);
      results := results || jsonb_build_object('test', 'agent cannot set up the page', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot set up the page', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    insert into public.booking_settings (workspace_id, enabled, host_user_id, min_notice_hours, max_days_ahead, hours)
    values (ws_a, false, agent_a, 0, 14,
            '{"sun":[["00:00","23:30"]],"mon":[["00:00","23:30"]],"tue":[["00:00","23:30"]],"wed":[["00:00","23:30"]],"thu":[["00:00","23:30"]],"fri":[["00:00","23:30"]],"sat":[["00:00","23:30"]]}');

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_public_slots(slug_a);
    results := results || jsonb_build_object('test', 'no slots while the page is off', 'passed', n = 0, 'detail', n);
    begin
      perform * from public.booking_public_book(slug_a, now() + interval '2 days', 'Pat Lead', 'pat@rls.test', null, null, null);
      results := results || jsonb_build_object('test', 'no booking while the page is off', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'no booking while the page is off', 'passed', sqlstate = 'PT404', 'detail', sqlstate);
    end;

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    update public.booking_settings set enabled = true where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'agent cannot switch the page on', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    update public.booking_settings set enabled = true where workspace_id = ws_a;
    begin
      update public.booking_settings set feed_token_hash = repeat('0', 64) where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'the feed token can''t be set directly', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'the feed token can''t be set directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select title into t from public.booking_public_page(slug_a);
    results := results || jsonb_build_object('test', 'the page shows once on', 'passed', t = 'Book a call', 'detail', t);
    select count(*) into n from public.booking_public_slots(slug_a);
    results := results || jsonb_build_object('test', 'open slots are listed', 'passed', n > 50, 'detail', n);
    select starts_at into slot1 from public.booking_public_slots(slug_a) order by starts_at offset 4 limit 1;
    select starts_at into slot2 from public.booking_public_slots(slug_a) order by starts_at offset 8 limit 1;
    select starts_at into slot3 from public.booking_public_slots(slug_a) order by starts_at offset 12 limit 1;
    begin
      select count(*) into n from public.bookings;
      results := results || jsonb_build_object('test', 'anon cannot read bookings', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read bookings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      select count(*) into n from public.booking_settings;
      results := results || jsonb_build_object('test', 'anon cannot read settings', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read settings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    select booking_id into b1 from public.booking_public_book(slug_a, slot1, 'Pat Lead', 'pat@rls.test', '(619) 555-0142', 'Selling a fourplex', ck);
    results := results || jsonb_build_object('test', 'the public books an open slot', 'passed', b1 is not null, 'detail', null);
    select count(*) into n from public.booking_public_slots(slug_a) where starts_at = slot1;
    results := results || jsonb_build_object('test', 'a booked slot is no longer offered', 'passed', n = 0, 'detail', n);
    begin
      perform * from public.booking_public_book(slug_a, slot1, 'Sam Other', 'other@rls.test', null, null, null);
      results := results || jsonb_build_object('test', 'a taken slot is refused', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'a taken slot is refused', 'passed', sqlstate = 'PT409', 'detail', sqlstate);
    end;
    begin
      perform * from public.booking_public_book(slug_a, slot2 + interval '7 minutes', 'Sam Other', 'other@rls.test', null, null, null);
      results := results || jsonb_build_object('test', 'an off-grid time is refused', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'an off-grid time is refused', 'passed', sqlstate = 'PT409', 'detail', sqlstate);
    end;
    begin
      perform * from public.booking_public_book(slug_a, slot2, 'Sam Other', null, null, null, null);
      results := results || jsonb_build_object('test', 'a way to reach the lead is required', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'a way to reach the lead is required', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    perform * from public.booking_public_book(slug_a, slot2, 'Pat Lead', 'PAT@rls.test', null, null, ck);
    begin
      perform * from public.booking_public_book(slug_a, slot3, 'Pat Lead', 'pat@rls.test', null, null, null);
      results := results || jsonb_build_object('test', 'one person can''t stack bookings', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'one person can''t stack bookings', 'passed', sqlstate = 'PT429', 'detail', sqlstate);
    end;
    perform * from public.booking_public_book(slug_a, slot3, 'Lee Lead', 'lee@rls.test', null, null, ck);
    begin
      perform * from public.booking_public_book(slug_a, slot3 + interval '30 minutes', 'Kim Lead', 'kim@rls.test', null, null, ck);
      results := results || jsonb_build_object('test', 'per-visitor rate limit', 'passed', false, 'detail', 'booked');
    exception when others then
      results := results || jsonb_build_object('test', 'per-visitor rate limit', 'passed', sqlstate = 'PT429', 'detail', sqlstate);
    end;

    perform set_config('role', 'postgres', true);
    select count(*) into n from public.contacts
      where workspace_id = ws_a and email_keys @> array['pat@rls.test'] and 'booked-call' = any (tags);
    results := results || jsonb_build_object('test', 'one contact per person, tagged', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities a join public.contacts c on c.id = a.subject_id
      where a.workspace_id = ws_a and a.type = 'meeting' and c.email_keys @> array['pat@rls.test'];
    results := results || jsonb_build_object('test', 'each booking logs a meeting', 'passed', n = 2, 'detail', n);
    select count(*) into n from public.tasks where workspace_id = ws_a and assigned_to = agent_a and title like 'Booked call:%';
    results := results || jsonb_build_object('test', 'the host gets a task per booking', 'passed', n = 3, 'detail', n);

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.bookings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer sees the bookings', 'passed', n = 3, 'detail', n);
    begin
      insert into public.bookings (workspace_id, kind, starts_at, ends_at, title, created_by)
      values (ws_a, 'block', now() + interval '1 day', now() + interval '1 day 1 hour', 'Busy', viewer_a);
      results := results || jsonb_build_object('test', 'viewer cannot block time', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot block time', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    update public.bookings set status = 'canceled' where id = b1;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'viewer cannot cancel', 'passed', n = 0, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.bookings (workspace_id, kind, starts_at, ends_at, name, source, created_by)
      values (ws_a, 'meeting', now() + interval '1 day', now() + interval '1 day 1 hour', 'Fake', 'booking_page', agent_a);
      results := results || jsonb_build_object('test', 'staff can''t forge public bookings', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'staff can''t forge public bookings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    insert into public.bookings (workspace_id, kind, starts_at, ends_at, title, created_by)
    values (ws_a, 'block', slot3 + interval '2 hours', slot3 + interval '4 hours', 'Escrow signing', agent_a);
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_public_slots(slug_a)
      where starts_at >= slot3 + interval '2 hours' and starts_at < slot3 + interval '4 hours';
    results := results || jsonb_build_object('test', 'blocked time is not offered', 'passed', n = 0, 'detail', n);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    update public.bookings set status = 'canceled', canceled_at = now() where id = b1;
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_public_slots(slug_a) where starts_at = slot1;
    results := results || jsonb_build_object('test', 'canceling frees the slot', 'passed', n = 1, 'detail', n);

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.bookings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot see A''s bookings', 'passed', n = 0, 'detail', n);
    update public.bookings set status = 'no_show' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot change A''s bookings', 'passed', n = 0, 'detail', n);
    begin
      perform public.booking_rotate_feed(ws_a);
      results := results || jsonb_build_object('test', 'B cannot make A''s feed', 'passed', false, 'detail', 'made');
    exception when others then
      results := results || jsonb_build_object('test', 'B cannot make A''s feed', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      perform public.booking_rotate_feed(ws_a);
      results := results || jsonb_build_object('test', 'agent cannot make the feed', 'passed', false, 'detail', 'made');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot make the feed', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    token := public.booking_rotate_feed(ws_a);
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_feed(token);
    results := results || jsonb_build_object('test', 'the feed lists bookings and blocks', 'passed', n = 4, 'detail', n);
    select count(*) into n from public.booking_feed(repeat('0', 48));
    results := results || jsonb_build_object('test', 'a wrong feed token sees nothing', 'passed', n = 0, 'detail', n);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    perform public.booking_rotate_feed(ws_a);
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.booking_feed(token);
    results := results || jsonb_build_object('test', 'a new feed link turns the old one off', 'passed', n = 0, 'detail', n);

    raise exception using errcode = 'RLSOK', message = 'rolling back booking RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$bk$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-bk-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-bk-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_booking_rls_suite();
