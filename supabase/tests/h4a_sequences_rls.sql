-- =============================================================================
-- Housing4All Track (Phase 4E) RLS suite: follow-up sequences.
--
-- Throwaway users/workspaces in a subtransaction that is ALWAYS rolled back.
-- Safe on hosted after the migration:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_sequences_rls.sql
--
-- Covers: writers build sequences and enroll contacts, viewers only read; other
-- workspaces and anon see nothing; enrollments and step records are authored by
-- the caller; one active enrollment per contact and sequence; do-not-contact
-- and STOP end active enrollments at once.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_sequences_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_sequences_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $sq$
declare
  results jsonb := '[]'::jsonb;
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004e1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004e2';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000004e0';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000004e1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000004e1';
  c1 uuid;
  c2 uuid;
  seq uuid;
  enr uuid;
  enr2 uuid;
  n bigint;
  t text;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (agent_a, 'h4a-seq-rls-agent@rls.test'), (viewer_a, 'h4a-seq-rls-viewer@rls.test'),
                 (admin_b, 'h4a-seq-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'SEQ RLS A', 'h4a-seq-rls-test-a', 'real_estate', true),
           (ws_b, 'SEQ RLS B', 'h4a-seq-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, agent_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, admin_b, 'admin');
    insert into public.contacts (workspace_id, first_name, phones)
    values (ws_a, 'One', '[{"value": "(619) 555-0481", "type": "mobile"}]') returning id into c1;
    insert into public.contacts (workspace_id, first_name) values (ws_a, 'Two') returning id into c2;

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.outreach_sequences (workspace_id, name) values (ws_a, 'Nope');
      results := results || jsonb_build_object('test', 'viewer cannot create sequences', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot create sequences', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    insert into public.outreach_sequences (workspace_id, name, active) values (ws_a, 'New owner lead', true) returning id into seq;
    insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, wait_days, subject, body)
    values (ws_a, seq, 1, 'email', 0, 'Hello', 'Hi {first_name}'), (ws_a, seq, 2, 'sms', 3, null, 'Following up');
    select count(*) into n from public.outreach_sequence_steps where sequence_id = seq;
    results := results || jsonb_build_object('test', 'writers build sequences', 'passed', n = 2, 'detail', n);
    begin
      insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, body)
      values (ws_a, seq, 3, 'sms', repeat('x', 1601));
      results := results || jsonb_build_object('test', 'text steps are capped at 1,600 characters', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'text steps are capped at 1,600 characters', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;

    insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, enrolled_by)
    values (ws_a, seq, c1, agent_a) returning id into enr;
    results := results || jsonb_build_object('test', 'writers enroll contacts', 'passed', enr is not null, 'detail', null);
    begin
      insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, enrolled_by)
      values (ws_a, seq, c1, agent_a);
      results := results || jsonb_build_object('test', 'one active enrollment per contact', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'one active enrollment per contact', 'passed', sqlstate = '23505', 'detail', sqlstate);
    end;
    begin
      insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, enrolled_by)
      values (ws_a, seq, c2, viewer_a);
      results := results || jsonb_build_object('test', 'enrollments are authored by the caller', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'enrollments are authored by the caller', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, enrolled_by)
    values (ws_a, seq, c2, agent_a) returning id into enr2;
    insert into public.outreach_sequence_events (workspace_id, enrollment_id, position, channel, outcome, actor_id)
    values (ws_a, enr, 1, 'email', 'sent', agent_a);
    begin
      insert into public.outreach_sequence_events (workspace_id, enrollment_id, position, channel, outcome, actor_id)
      values (ws_a, enr, 1, 'email', 'sent', viewer_a);
      results := results || jsonb_build_object('test', 'step records are authored by the caller', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'step records are authored by the caller', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      update public.outreach_enrollments set contact_id = c2 where id = enr;
      results := results || jsonb_build_object('test', 'an enrollment can''t be moved to another contact', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'an enrollment can''t be moved to another contact', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    update public.outreach_enrollments set next_position = 2, next_due_at = now() + interval '3 days' where id = enr;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'writers advance enrollments', 'passed', n = 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.outreach_enrollments where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads enrollments', 'passed', n = 2, 'detail', n);
    begin
      insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, enrolled_by)
      values (ws_a, seq, c2, viewer_a);
      results := results || jsonb_build_object('test', 'viewer cannot enroll', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot enroll', 'passed', sqlstate in ('42501', '23505'), 'detail', sqlstate);
    end;
    update public.outreach_enrollments set status = 'stopped' where id = enr;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'viewer cannot stop an enrollment', 'passed', n = 0, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.outreach_sequences where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot see A''s sequences', 'passed', n = 0, 'detail', n);
    update public.outreach_enrollments set status = 'stopped' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot change A''s enrollments', 'passed', n = 0, 'detail', n);
    begin
      insert into public.outreach_sequence_steps (workspace_id, sequence_id, position, channel, body)
      values (ws_b, seq, 9, 'sms', 'hijack');
      results := results || jsonb_build_object('test', 'B cannot add steps to A''s sequence', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'B cannot add steps to A''s sequence', 'passed', sqlstate in ('42501', '23503'), 'detail', sqlstate);
    end;

    -- Do-not-contact and STOP end active enrollments at once.
    perform set_config('role', 'postgres', true);
    update public.contacts set dnc = true where id = c2;
    select status || ':' || coalesce(stop_reason, '') into t from public.outreach_enrollments where id = enr2;
    results := results || jsonb_build_object('test', 'do-not-contact stops their sequences', 'passed', t = 'stopped:Marked do-not-contact', 'detail', t);
    insert into public.outreach_suppressions (workspace_id, channel, value, reason, contact_id)
    values (ws_a, 'sms', '+16195550481', 'stop', c1);
    select status || ':' || coalesce(stop_reason, '') into t from public.outreach_enrollments where id = enr;
    results := results || jsonb_build_object('test', 'STOP stops their sequences', 'passed', t = 'stopped:Texted STOP', 'detail', t);

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.outreach_sequences;
      results := results || jsonb_build_object('test', 'anon cannot read sequences', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read sequences', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back sequences RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$sq$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || coalesce(info, ''), E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-seq-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-seq-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_sequences_rls_suite();
