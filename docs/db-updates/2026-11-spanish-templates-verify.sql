
create or replace function pg_temp.h4a_spanish_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $es$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000008e0';
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000008e1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000008e2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000008e0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000008e1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000008e1';
  seq uuid;
  token text;
  n bigint;
  m bigint;
  k text;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-es-rls-admin@rls.test'), (agent_a, 'h4a-es-rls-agent@rls.test'),
                 (viewer_a, 'h4a-es-rls-viewer@rls.test'), (admin_b, 'h4a-es-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'ES RLS A', 'h4a-es-rls-test-a', 'real_estate', true),
           (ws_b, 'ES RLS B', 'h4a-es-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    insert into public.outreach_sequences (workspace_id, name, created_by)
    values (ws_a, 'Bilingual', agent_a) returning id into seq;
    insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, subject, body, subject_es, body_es)
    values (ws_a, seq, 1, 'email', 'Hi', 'Hello {first_name}', 'Hola', 'Hola {first_name}'),
           (ws_a, seq, 2, 'sms', null, 'Hi again', null, 'Hola de nuevo. Responda ALTO para no recibir más mensajes.');
    select count(*) into n from public.outreach_sequence_steps where sequence_id = seq and body_es like 'Hola%';
    results := results || jsonb_build_object('test', 'a writer saves Spanish versions of steps', 'passed', n = 2, 'detail', n);
    begin
      insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, body, body_es)
      values (ws_a, seq, 3, 'sms', 'Hi', repeat('a', 1601));
      results := results || jsonb_build_object('test', 'Spanish texts are capped at 1,600 characters', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'Spanish texts are capped at 1,600 characters', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, subject, body, subject_es)
      values (ws_a, seq, 3, 'email', 'Hi', 'Hello', 'Hola');
      results := results || jsonb_build_object('test', 'a Spanish subject needs a Spanish message', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'a Spanish subject needs a Spanish message', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, body, body_es)
      values (ws_a, seq, 3, 'email', 'Hello', '');
      results := results || jsonb_build_object('test', 'an empty Spanish message is refused', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'an empty Spanish message is refused', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.outreach_sequence_steps where sequence_id = seq and body_es is not null;
    results := results || jsonb_build_object('test', 'a viewer reads the Spanish versions', 'passed', n = 2, 'detail', n);
    update public.outreach_sequence_steps set body_es = 'cambiado' where sequence_id = seq;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'a viewer cannot change a Spanish version', 'passed', n = 0, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.outreach_sequence_steps where sequence_id = seq;
    results := results || jsonb_build_object('test', 'B cannot read A''s steps', 'passed', n = 0, 'detail', n);
    update public.outreach_sequence_steps set body_es = 'cambiado' where sequence_id = seq;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot change A''s Spanish versions', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    insert into public.sms_settings (workspace_id, enabled, from_number, help_reply)
    values (ws_a, false, '+16195550199', 'H4A test: reply STOP to opt out.');
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    update public.sms_settings set help_reply_es = 'cambiado' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'an agent cannot set the Spanish HELP reply', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    update public.sms_settings set help_reply_es = 'cambiado' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot set A''s Spanish HELP reply', 'passed', n = 0, 'detail', n);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    begin
      update public.sms_settings set help_reply_es = repeat('a', 321) where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'the Spanish HELP reply is 320 characters at most', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'the Spanish HELP reply is 320 characters at most', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    token := public.sms_create_token(ws_a);
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select r.keyword, r.help_reply into k, t
      from public.sms_receive(token, '+16195550111', '+16195550199', 'Ayuda', 'SM' || repeat('a', 32)) r;
    results := results || jsonb_build_object('test', 'AYUDA without a Spanish reply gets the English one',
      'passed', k = 'help' and t = 'H4A test: reply STOP to opt out.', 'detail', coalesce(k, 'null') || '/' || coalesce(t, 'null'));

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    update public.sms_settings set help_reply_es = 'H4A prueba: responda ALTO para no recibir más mensajes.' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'an admin sets the Spanish HELP reply', 'passed', n = 1, 'detail', n);

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select r.keyword, r.help_reply into k, t
      from public.sms_receive(token, '+16195550111', '+16195550199', 'AYUDA', 'SM' || repeat('b', 32)) r;
    results := results || jsonb_build_object('test', 'AYUDA returns the Spanish HELP reply',
      'passed', k = 'help' and t like 'H4A prueba%', 'detail', coalesce(k, 'null') || '/' || coalesce(t, 'null'));
    select r.help_reply into t
      from public.sms_receive(token, '+16195550111', '+16195550199', 'AYUDA', 'SM' || repeat('b', 32)) r;
    results := results || jsonb_build_object('test', 'a Twilio retry of AYUDA returns the Spanish reply again',
      'passed', t like 'H4A prueba%', 'detail', t);
    select r.keyword, r.help_reply into k, t
      from public.sms_receive(token, '+16195550111', '+16195550199', 'help', 'SM' || repeat('c', 32)) r;
    results := results || jsonb_build_object('test', 'HELP still returns the English reply',
      'passed', k = 'help' and t like 'H4A test%', 'detail', coalesce(k, 'null') || '/' || coalesce(t, 'null'));

    select r.keyword into k from public.sms_receive(token, '+16195550112', '+16195550199', 'Alto.', 'SM' || repeat('d', 32)) r;
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions
      where workspace_id = ws_a and channel = 'sms' and value = '+16195550112' and reason = 'stop';
    results := results || jsonb_build_object('test', 'ALTO goes on the do-not-text list', 'passed', k = 'stop' and n = 1, 'detail', coalesce(k, 'null') || '/' || n);
    perform set_config('role', 'anon', true);
    select r.keyword into k from public.sms_receive(token, '+16195550113', '+16195550199', 'para', 'SM' || repeat('e', 32)) r;
    select r.keyword into t from public.sms_receive(token, '+16195550114', '+16195550199', 'BAJA', 'SM' || repeat('f', 32)) r;
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions
      where workspace_id = ws_a and channel = 'sms' and value in ('+16195550113', '+16195550114');
    results := results || jsonb_build_object('test', 'PARA and BAJA opt out too', 'passed', k = 'stop' and t = 'stop' and n = 2, 'detail', n);

    perform set_config('role', 'anon', true);
    select r.keyword into k from public.sms_receive(token, '+16195550112', '+16195550199', 'Iniciar', 'SM' || repeat('0', 31) || '1') r;
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions
      where workspace_id = ws_a and channel = 'sms' and value = '+16195550112';
    results := results || jsonb_build_object('test', 'INICIAR takes the number off the list', 'passed', k = 'start' and n = 0, 'detail', coalesce(k, 'null') || '/' || n);

    perform set_config('role', 'anon', true);
    select r.keyword into k from public.sms_receive(token, '+16195550115', '+16195550199', 'Para mañana está bien', 'SM' || repeat('0', 31) || '2') r;
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions where workspace_id = ws_a and value = '+16195550115';
    select count(*) into m from public.tasks t join public.contacts c on c.id = t.related_id
      where t.workspace_id = ws_a and c.phone_keys @> array['+16195550115'] and t.title like 'Reply to text%';
    results := results || jsonb_build_object('test', 'a sentence starting with PARA is an ordinary text',
      'passed', k is null and n = 0 and m = 1, 'detail', coalesce(k, 'null') || '/' || n || '/' || m);

    perform set_config('role', 'anon', true);
    begin
      select count(*) into n from public.outreach_sequence_steps;
      results := results || jsonb_build_object('test', 'anon cannot read steps', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read steps', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back Spanish RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$es$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-es-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-es-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_spanish_rls_suite();
