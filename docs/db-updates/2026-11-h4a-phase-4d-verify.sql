
create or replace function pg_temp.h4a_texting_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $sm$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004d0';
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004d1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004d2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000004d0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000004d1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000004d1';
  c_ok uuid;
  c_dnc uuid;
  c_none uuid;
  c_land uuid;
  c_stop uuid;
  c_b uuid;
  tz text;
  in_window boolean;
  msg uuid;
  token text;
  sid1 text := 'SM' || repeat('1', 32);
  sid2 text := 'SM' || repeat('2', 32);
  sid3 text := 'SM' || repeat('3', 32);
  sid4 text := 'SM' || repeat('4', 32);
  sid5 text := 'SM' || repeat('5', 32);
  sid6 text := 'SM' || repeat('6', 32);
  n bigint;
  t text;
  k text;
  ph jsonb;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-sms-rls-admin@rls.test'), (agent_a, 'h4a-sms-rls-agent@rls.test'),
                 (viewer_a, 'h4a-sms-rls-viewer@rls.test'), (admin_b, 'h4a-sms-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'SMS RLS A', 'h4a-sms-rls-test-a', 'real_estate', true),
           (ws_b, 'SMS RLS B', 'h4a-sms-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');

    ph := '[{"value": "(619) 555-0101", "type": "mobile", "is_primary": true}]';
    insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source)
    values (ws_a, 'Ok', ph, 'express', now(), 'test') returning id into c_ok;
    insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source, dnc)
    values (ws_a, 'Dnc', '[{"value": "(619) 555-0102", "type": "mobile"}]', 'express', now(), 'test', true) returning id into c_dnc;
    insert into public.contacts (workspace_id, first_name, phones)
    values (ws_a, 'None', '[{"value": "(619) 555-0103", "type": "mobile"}]') returning id into c_none;
    insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source)
    values (ws_a, 'Land', '[{"value": "(619) 555-0104", "type": "landline"}]', 'express', now(), 'test') returning id into c_land;
    insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source)
    values (ws_a, 'Stop', '[{"value": "(619) 555-0105", "type": "mobile"}]', 'express', now(), 'test') returning id into c_stop;
    insert into public.outreach_suppressions (workspace_id, channel, value, reason, contact_id)
    values (ws_a, 'sms', '+16195550105', 'stop', c_stop);
    insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source)
    values (ws_b, 'Bee', '[{"value": "(619) 555-0106", "type": "mobile"}]', 'express', now(), 'test') returning id into c_b;
    select z into tz from unnest(array['America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']) z
    where extract(hour from now() at time zone z) between 8 and 20 limit 1;
    in_window := tz is not null;
    insert into public.outreach_settings (workspace_id, time_zone)
    values (ws_a, coalesce(tz, 'America/Los_Angeles'));
    results := results || jsonb_build_object('test', 'window opens at 8am Pacific',
      'passed', app_private.sms_in_window(ws_b, '2026-11-05 16:00Z') and not app_private.sms_in_window(ws_b, '2026-11-05 15:59Z'), 'detail', null);
    results := results || jsonb_build_object('test', 'window closes at 9pm Pacific',
      'passed', app_private.sms_in_window(ws_b, '2026-11-06 04:59Z') and not app_private.sms_in_window(ws_b, '2026-11-06 05:00Z'), 'detail', null);

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.sms_settings (workspace_id, enabled, from_number) values (ws_a, true, '+16195550199');
      results := results || jsonb_build_object('test', 'agent cannot set up texting', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot set up texting', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'queued', '+16195550101', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'nothing queues before texting is set up', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'nothing queues before texting is set up', 'passed', sqlstate = 'PT403', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    insert into public.sms_settings (workspace_id, enabled, from_number, help_reply)
    values (ws_a, false, '+16195550199', 'Housing4All test: reply STOP to opt out.');
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'queued', '+16195550101', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'nothing queues while texting is off', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'nothing queues while texting is off', 'passed', sqlstate = 'PT403', 'detail', sqlstate);
    end;
    update public.sms_settings set enabled = true where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'agent cannot switch texting on', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    update public.sms_settings set enabled = true where workspace_id = ws_a;
    begin
      update public.sms_settings set webhook_token_hash = repeat('0', 64) where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'the webhook token can''t be set directly', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'the webhook token can''t be set directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_dnc, 'out', 'queued', '+16195550102', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'gate: do-not-contact', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'gate: do-not-contact', 'passed', sqlstate = 'PT403' and sqlerrm like '%do-not-contact%', 'detail', sqlerrm);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_none, 'out', 'queued', '+16195550103', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'gate: no consent', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'gate: no consent', 'passed', sqlstate = 'PT403' and sqlerrm like '%consent%', 'detail', sqlerrm);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_land, 'out', 'queued', '+16195550104', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'gate: landline', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'gate: landline', 'passed', sqlstate = 'PT403' and sqlerrm like '%landline%', 'detail', sqlerrm);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_stop, 'out', 'queued', '+16195550105', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'gate: texted STOP', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'gate: texted STOP', 'passed', sqlstate = 'PT403' and sqlerrm like '%STOP%', 'detail', sqlerrm);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'queued', '+16195550177', 'Hi', agent_a);
      results := results || jsonb_build_object('test', 'gate: number must be on the contact', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'gate: number must be on the contact', 'passed', sqlstate = 'PT403', 'detail', sqlerrm);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'queued', '+16195550101', 'Hi from the suite', agent_a) returning id into msg;
      results := results || jsonb_build_object('test', 'a text that passes every gate queues (in hours)', 'passed', in_window, 'detail', coalesce(tz, 'night in every US zone'));
    exception when others then
      results := results || jsonb_build_object('test', 'a text that passes every gate queues (in hours)',
        'passed', not in_window and sqlerrm like '%texting hours%', 'detail', sqlerrm);
    end;
    if msg is not null then
      update public.sms_messages set status = 'sent', provider_sid = sid1 where id = msg;
      get diagnostics n = row_count;
      results := results || jsonb_build_object('test', 'the sender records Twilio''s answer', 'passed', n = 1, 'detail', n);
      update public.sms_messages set status = 'delivered' where id = msg;
      get diagnostics n = row_count;
      results := results || jsonb_build_object('test', 'the sender can''t fake delivery', 'passed', n = 0, 'detail', n);
    else
      results := results || jsonb_build_object('test', 'the sender records Twilio''s answer', 'passed', true, 'detail', 'skipped: outside hours');
      results := results || jsonb_build_object('test', 'the sender can''t fake delivery', 'passed', true, 'detail', 'skipped: outside hours');
    end if;
    insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, blocks, sent_by)
    values (ws_a, c_dnc, 'out', 'blocked', '+16195550102', 'Hi', '[{"code":"dnc","message":"Marked do-not-contact"}]', agent_a);
    results := results || jsonb_build_object('test', 'blocked attempts are logged', 'passed', true, 'detail', null);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'in', 'received', '+16195550199', 'fake', agent_a);
      results := results || jsonb_build_object('test', 'staff can''t forge inbound texts', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'staff can''t forge inbound texts', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_dnc, 'out', 'blocked', '+16195550102', 'Hi', admin_a);
      results := results || jsonb_build_object('test', 'texts are authored by the caller', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'texts are authored by the caller', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    if in_window then
      perform set_config('role', 'postgres', true);
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      select ws_a, c_ok, 'out', 'sent', '+16195550101', 'cap ' || g, agent_a from generate_series(1, 9) g;
      perform set_config('role', 'authenticated', true);
      begin
        insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
        values (ws_a, c_ok, 'out', 'queued', '+16195550101', 'one too many', agent_a);
        results := results || jsonb_build_object('test', 'daily cap per contact', 'passed', false, 'detail', 'queued');
      exception when others then
        results := results || jsonb_build_object('test', 'daily cap per contact', 'passed', sqlstate = 'PT429', 'detail', sqlstate);
      end;
    else
      results := results || jsonb_build_object('test', 'daily cap per contact', 'passed', true, 'detail', 'skipped: outside hours');
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_dnc, 'out', 'blocked', '+16195550102', 'Hi', viewer_a);
      results := results || jsonb_build_object('test', 'viewer cannot send', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot send', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.sms_messages where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads the texts', 'passed', n >= 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.sms_messages where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot read A''s texts', 'passed', n = 0, 'detail', n);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'blocked', '+16195550101', 'Hi', admin_b);
      results := results || jsonb_build_object('test', 'B cannot text from A', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'B cannot text from A', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      perform public.sms_create_token(ws_a);
      results := results || jsonb_build_object('test', 'agent cannot make the webhook link', 'passed', false, 'detail', 'made');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot make the webhook link', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    token := public.sms_create_token(ws_a);
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      perform * from public.sms_receive(repeat('0', 48), '+16195550101', '+16195550199', 'hi', sid2);
      results := results || jsonb_build_object('test', 'a wrong webhook token is refused', 'passed', false, 'detail', 'received');
    exception when others then
      results := results || jsonb_build_object('test', 'a wrong webhook token is refused', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    perform * from public.sms_receive(token, '(858) 555-0190', '+16195550199', 'Is the fourplex still available?', sid2);
    perform * from public.sms_receive(token, '(858) 555-0190', '+16195550199', 'Is the fourplex still available?', sid2);
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.sms_messages where workspace_id = ws_a and provider_sid = sid2;
    results := results || jsonb_build_object('test', 'Twilio retries don''t duplicate', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.contacts where workspace_id = ws_a and phone_keys @> array['+18585550190'] and 'texted-in' = any (tags);
    results := results || jsonb_build_object('test', 'an unknown texter becomes a contact', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.tasks t join public.contacts c on c.id = t.related_id
      where t.workspace_id = ws_a and c.phone_keys @> array['+18585550190'] and t.title like 'Reply to text%';
    results := results || jsonb_build_object('test', 'an inbound text tasks someone to reply', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities a join public.contacts c on c.id = a.subject_id
      where a.workspace_id = ws_a and a.type = 'sms' and c.phone_keys @> array['+18585550190'];
    results := results || jsonb_build_object('test', 'an inbound text is on the timeline', 'passed', n = 1, 'detail', n);

    perform set_config('role', 'anon', true);
    select r.keyword into k from public.sms_receive(token, '+16195550101', '+16195550199', 'Stop', sid3) r;
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions where workspace_id = ws_a and channel = 'sms' and value = '+16195550101' and reason = 'stop';
    results := results || jsonb_build_object('test', 'STOP goes on the do-not-text list', 'passed', k = 'stop' and n = 1, 'detail', k || '/' || n);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, sent_by)
      values (ws_a, c_ok, 'out', 'queued', '+16195550101', 'After stop', agent_a);
      results := results || jsonb_build_object('test', 'no texts after STOP', 'passed', false, 'detail', 'queued');
    exception when others then
      results := results || jsonb_build_object('test', 'no texts after STOP', 'passed', sqlstate = 'PT403', 'detail', sqlerrm);
    end;
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform * from public.sms_receive(token, '+16195550101', '+16195550199', 'START', sid4);
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions where workspace_id = ws_a and channel = 'sms' and value = '+16195550101';
    results := results || jsonb_build_object('test', 'START takes the number off the list', 'passed', n = 0, 'detail', n);
    perform set_config('role', 'anon', true);
    select r.keyword, r.help_reply into k, t from public.sms_receive(token, '+16195550101', '+16195550199', 'help', sid5) r;
    results := results || jsonb_build_object('test', 'HELP returns the help reply', 'passed', k = 'help' and t like 'Housing4All test%', 'detail', k);
    perform set_config('role', 'postgres', true);
    insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, body, provider_sid, sent_by)
    values (ws_a, c_ok, 'out', 'sent', '+16195550101', 'status test', sid6, agent_a);
    perform set_config('role', 'anon', true);
    perform public.sms_status(sid6, 'delivered', null);
    perform public.sms_status(sid6, 'sent', null);
    perform public.sms_status(sid2, 'failed', 'x');
    perform set_config('role', 'postgres', true);
    select status into t from public.sms_messages where provider_sid = sid6;
    results := results || jsonb_build_object('test', 'delivery status moves forward only', 'passed', t = 'delivered', 'detail', t);
    select status into t from public.sms_messages where provider_sid = sid2;
    results := results || jsonb_build_object('test', 'status can''t touch inbound texts', 'passed', t = 'received', 'detail', t);

    perform set_config('role', 'anon', true);
    begin
      select count(*) into n from public.sms_messages;
      results := results || jsonb_build_object('test', 'anon cannot read texts', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read texts', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      select count(*) into n from public.sms_settings;
      results := results || jsonb_build_object('test', 'anon cannot read texting settings', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read texting settings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back texting RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$sm$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-sms-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-sms-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_texting_rls_suite();
