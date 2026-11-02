-- =============================================================================
-- Housing4All Track (Phase 7A) RLS suite: AI receptionist.
--
-- Same pattern as the other suites (rolled-back fixtures, impersonation).
-- Safe on hosted after the migration:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_receptionist_rls.sql
--
-- Covers: isolation; only admins configure routes/settings or create the token;
-- members read the call log but can't write it; anon can't read anything and
-- can call the webhook functions only with a valid token; a call matches the
-- contact by phone (or creates one), logs one `call` activity that updates as
-- details arrive, creates one follow-up task for the route's owner when nobody
-- picked up; outcomes only move forward; a rotated token stops working.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_receptionist_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_receptionist_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $rec$
declare
  results jsonb := '[]'::jsonb;
  admin_a uuid := 'aaaaaaaa-0000-4000-a000-0000000007a0';
  agent_a uuid := 'aaaaaaaa-0000-4000-a000-0000000007a1';
  admin_b uuid := 'bbbbbbbb-0000-4000-a000-0000000007b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000007a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000007b1';
  route_pm uuid;
  contact_known uuid;
  token_a text;
  token_old text;
  call1 uuid;
  call2 uuid;
  n bigint;
  t text;
  j jsonb;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (admin_a, 'h4a-rec-rls-admin@rls.test'), (agent_a, 'h4a-rec-rls-agent@rls.test'),
                 (admin_b, 'h4a-rec-rls-b@rls.test')) as u(id, email);
    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'Receptionist RLS A', 'h4a-rec-rls-test-a', 'real_estate', true),
           (ws_b, 'Receptionist RLS B', 'h4a-rec-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, admin_a, 'admin'), (ws_a, agent_a, 'agent'), (ws_b, admin_b, 'admin');
    insert into public.contacts (workspace_id, first_name, phones)
    values (ws_a, 'Known', '[{"value": "(619) 555-0142", "type": "mobile", "is_primary": true}]')
    returning id into contact_known;
    insert into public.receptionist_routes (workspace_id, name, keywords, is_default, assignee_user_id)
    values (ws_b, 'B route', '{}', true, admin_b);

    -- ---------- agent of A: read only ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.receptionist_routes (workspace_id, name) values (ws_a, 'Agent route');
      results := results || jsonb_build_object('test', 'agent cannot add routes', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot add routes', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.receptionist_create_token(ws_a);
      results := results || jsonb_build_object('test', 'agent cannot create the webhook token', 'passed', false, 'detail', 'created');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot create the webhook token', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select count(*) into n from public.receptionist_routes where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'A cannot read B routes', 'passed', n = 0, 'detail', n);

    -- ---------- admin of A: configure ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_a, 'role', 'authenticated')::text, true);
    insert into public.receptionist_settings (workspace_id, enabled, ring_seconds, greeting_en)
    values (ws_a, true, 15, 'Thanks for calling. This call may be recorded.');
    insert into public.receptionist_routes (workspace_id, name, forward_to, is_default, assignee_user_id, position)
    values (ws_a, 'Sam', '+16195550100', true, admin_a, 0);
    insert into public.receptionist_routes (workspace_id, name, forward_to, keywords, assignee_user_id, position)
    values (ws_a, 'Property management', null, array['repair', 'tenant', 'maintenance'], agent_a, 1)
    returning id into route_pm;
    results := results || jsonb_build_object('test', 'admin configures settings and routes', 'passed', true, 'detail', null);
    begin
      insert into public.receptionist_routes (workspace_id, name, forward_to) values (ws_a, 'Bad number', '619-555');
      results := results || jsonb_build_object('test', 'forward-to numbers must be E.164', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'forward-to numbers must be E.164', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    select public.receptionist_create_token(ws_a) into token_old;
    select public.receptionist_create_token(ws_a) into token_a;
    select count(*) into n from public.receptionist_tokens where workspace_id = ws_a and revoked_at is null;
    results := results || jsonb_build_object('test', 'one active token; rotating revokes the old one', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.receptionist_tokens where token_hash = token_a;
    results := results || jsonb_build_object('test', 'only the token hash is stored', 'passed', n = 0, 'detail', n);
    begin
      insert into public.receptionist_tokens (workspace_id, token_hash) values (ws_a, repeat('a', 64));
      results := results || jsonb_build_object('test', 'tokens can''t be inserted directly', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'tokens can''t be inserted directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- anon: webhooks ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.receptionist_calls;
      results := results || jsonb_build_object('test', 'anon cannot read calls', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read calls', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.receptionist_config(token_old);
      results := results || jsonb_build_object('test', 'a rotated token stops working', 'passed', false, 'detail', 'worked');
    exception when others then
      results := results || jsonb_build_object('test', 'a rotated token stops working', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select public.receptionist_config(token_a) into j;
    results := results || jsonb_build_object('test', 'the token returns the config with active routes', 'passed',
      (j ->> 'enabled')::boolean and jsonb_array_length(j -> 'routes') = 2 and (j ->> 'ring_seconds')::int = 15, 'detail', j ->> 'ring_seconds');

    -- A known caller, answered by the owner.
    select public.receptionist_record_call(token_a, jsonb_build_object(
      'provider', 'twilio', 'provider_call_id', 'CA-known', 'from_number', '619-555-0142', 'to_number', '+16195550000',
      'outcome', 'in_progress')) into call1;
    perform public.receptionist_record_call(token_a, jsonb_build_object(
      'provider', 'twilio', 'provider_call_id', 'CA-known', 'outcome', 'answered', 'duration_secs', 95));
    perform public.receptionist_record_call(token_a, jsonb_build_object(
      'provider', 'twilio', 'provider_call_id', 'CA-known', 'outcome', 'missed'));

    -- An unknown caller after hours: AI answers, routes to property management, leaves a summary.
    select public.receptionist_record_call(token_a, jsonb_build_object(
      'provider', 'twilio', 'provider_call_id', 'CA-new', 'from_number', '+16195550199', 'outcome', 'answered_by_ai',
      'route_id', route_pm::text, 'caller_name', 'Pat Tenant', 'language', 'es',
      'summary', 'Leaking sink at 3100 Sample Ave, unit 4.', 'summary_source', 'ElevenLabs',
      'transcript', '[{"role":"agent","text":"Hola","at_secs":0},{"role":"caller","text":"Tengo una fuga","at_secs":3}]'::jsonb)) into call2;
    perform public.receptionist_record_call(token_a, jsonb_build_object(
      'provider', 'twilio', 'provider_call_id', 'CA-new', 'outcome', 'answered_by_ai', 'duration_secs', 140));
    begin
      perform public.receptionist_record_call('not-a-real-token', jsonb_build_object('provider', 'twilio', 'provider_call_id', 'x'));
      results := results || jsonb_build_object('test', 'webhook calls need a valid token', 'passed', false, 'detail', 'recorded');
    exception when others then
      results := results || jsonb_build_object('test', 'webhook calls need a valid token', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- check as the owner ----------
    perform set_config('role', 'postgres', true);
    select outcome || '|' || duration_secs::text || '|' || (contact_id = contact_known)::text into t
      from public.receptionist_calls where id = call1;
    results := results || jsonb_build_object('test', 'known caller matched by phone; a late "missed" doesn''t undo "answered"',
      'passed', t = 'answered|95|true', 'detail', t);
    select count(*) into n from public.tasks where related_id = contact_known;
    results := results || jsonb_build_object('test', 'no follow-up task when the call was answered', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.activities where subject_id = contact_known and type = 'call';
    results := results || jsonb_build_object('test', 'one call activity per call', 'passed', n = 1, 'detail', n);

    select count(*) into n from public.contacts c join public.receptionist_calls rc on rc.contact_id = c.id
     where rc.id = call2 and c.source = 'AI receptionist' and 'receptionist' = any (c.tags)
       and c.first_name = 'Pat' and c.last_name = 'Tenant';
    results := results || jsonb_build_object('test', 'an unknown caller becomes a contact (tagged, named)', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities a join public.receptionist_calls rc on rc.activity_id = a.id
     where rc.id = call2 and a.body like '%AI receptionist%Property management%Leaking sink%';
    results := results || jsonb_build_object('test', 'the activity carries outcome, route and summary', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.tasks tk join public.receptionist_calls rc on rc.task_id = tk.id
     where rc.id = call2 and tk.assigned_to = agent_a and tk.title like 'Call back Pat Tenant%';
    results := results || jsonb_build_object('test', 'one follow-up task for the route owner', 'passed', n = 1, 'detail', n);
    select jsonb_array_length(transcript) || '|' || language into t from public.receptionist_calls where id = call2;
    results := results || jsonb_build_object('test', 'transcript and language kept when later events omit them', 'passed', t = '2|es', 'detail', t);
    select count(*) into n from public.receptionist_calls where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'repeat events update the same call (no duplicates)', 'passed', n = 2, 'detail', n);

    -- ---------- members read the log; nobody writes it directly ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.receptionist_calls where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'members read the call log', 'passed', n = 2, 'detail', n);
    begin
      update public.receptionist_calls set summary = 'edited' where id = call2;
      results := results || jsonb_build_object('test', 'members cannot edit calls', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'members cannot edit calls', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', admin_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.receptionist_calls where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot read A calls', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.receptionist_tokens where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot see A tokens', 'passed', n = 0, 'detail', n);

    raise exception using errcode = 'RLSOK', message = 'rolling back receptionist RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$rec$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-rec-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-rec-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_receptionist_rls_suite();
