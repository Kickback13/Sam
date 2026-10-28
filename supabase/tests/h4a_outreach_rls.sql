-- =============================================================================
-- Housing4All Track (Phase 4A) RLS suite: outreach tables
-- (outreach_settings, outreach_suppressions, newsletters, newsletter_sends)
-- and the public unsubscribe functions.
--
-- Same pattern as h4a_analysis_rls.sql: throwaway users/workspaces created in a
-- subtransaction that is ALWAYS rolled back, then impersonation through the
-- `authenticated` / `anon` roles + JWT claims (exactly how PostgREST runs).
-- Safe to run on the hosted project after the migration is applied:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_outreach_rls.sql
-- (the hosted variant drops the @destructive blocks — the delete checks run locally).
--
-- Covers: workspace isolation both ways; settings are admin-only; writers
-- write newsletters/suppressions/sends; viewers read only; anon reads nothing;
-- suppression values must be normalized; the send log only accepts queued or
-- blocked rows, only delivery fields can change, status only moves forward and
-- rows can't be deleted; newsletters lock once sending starts; a sent email is
-- logged on the contact timeline; one-click unsubscribe works without login,
-- is idempotent, opts the contact out and reveals only a masked email.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_outreach_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_outreach_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $out$
declare
  results jsonb := '[]'::jsonb;
  user_o uuid := 'aaaaaaaa-0000-4000-a000-0000000004a0';
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004a1';
  user_v uuid := 'aaaaaaaa-0000-4000-a000-0000000004a3';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000004b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000004a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000004b1';
  contact_a uuid;
  contact_b uuid;
  nl_a uuid;
  nl_b uuid;
  send_q uuid;
  send_b uuid;
  token_q uuid;
  sup_a uuid;
  n bigint;
  t text;
  b boolean;
begin
  begin -- fixture subtransaction (always rolled back)

    -- ---------- fixtures (as table owner) ----------
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-out-rls-o@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-out-rls-a@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-out-rls-v@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-out-rls-b@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'Outreach RLS A', 'h4a-out-rls-test-a', 'real_estate', true),
           (ws_b, 'Outreach RLS B', 'h4a-out-rls-test-b', 'construction', true);

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_o, 'admin'), (ws_a, user_a, 'agent'), (ws_a, user_v, 'viewer'), (ws_b, user_b, 'admin');

    insert into public.contacts (workspace_id, first_name, emails)
    values (ws_a, 'Alpha', '[{"value": "alpha@example.com", "is_primary": true}]') returning id into contact_a;
    insert into public.contacts (workspace_id, first_name, emails)
    values (ws_b, 'Bravo', '[{"value": "bravo@example.com", "is_primary": true}]') returning id into contact_b;

    insert into public.outreach_settings (workspace_id, sender_name, mailing_address)
    values (ws_b, 'Bravo Co', '1 Bravo St, San Diego, CA');
    insert into public.outreach_suppressions (workspace_id, channel, value, reason)
    values (ws_b, 'email', 'gone@example.com', 'manual');
    insert into public.newsletters (workspace_id, subject, body)
    values (ws_b, 'Bravo news', 'Hi') returning id into nl_b;
    insert into public.newsletter_sends (workspace_id, newsletter_id, contact_id, email, status)
    values (ws_b, nl_b, contact_b, 'bravo@example.com', 'queued') returning id into send_b;

    -- ---------- impersonate A (agent = writer in workspace A) ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    foreach t in array array['outreach_settings', 'outreach_suppressions', 'newsletters', 'newsletter_sends'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_b;
      results := results || jsonb_build_object('test', 'A cannot read B ' || t, 'passed', n = 0, 'detail', n);
    end loop;

    -- Settings are admin-only.
    begin
      insert into public.outreach_settings (workspace_id, sender_name) values (ws_a, 'Agent attempt');
      results := results || jsonb_build_object('test', 'agent cannot write outreach settings', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'agent cannot write outreach settings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- Newsletters: writer creates; can't create in B.
    insert into public.newsletters (workspace_id, subject, body)
    values (ws_a, 'Alpha news', '# Hello') returning id into nl_a;
    results := results || jsonb_build_object('test', 'agent creates a newsletter', 'passed', nl_a is not null, 'detail', nl_a);
    begin
      insert into public.newsletters (workspace_id, subject) values (ws_b, 'Sneaky');
      results := results || jsonb_build_object('test', 'A cannot create a newsletter in B', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot create a newsletter in B', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.newsletters (workspace_id, subject, status) values (ws_a, 'Pre-sent', 'sent');
      results := results || jsonb_build_object('test', 'new newsletters must start as drafts', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'new newsletters must start as drafts', 'passed', sqlstate in ('42501', '23514'), 'detail', sqlstate);
    end;

    -- Suppressions: writer adds; values must be normalized.
    insert into public.outreach_suppressions (workspace_id, channel, value, reason, contact_id)
    values (ws_a, 'sms', '+16195550100', 'stop', contact_a) returning id into sup_a;
    results := results || jsonb_build_object('test', 'agent records a STOP', 'passed', sup_a is not null, 'detail', sup_a);
    begin
      insert into public.outreach_suppressions (workspace_id, channel, value, reason)
      values (ws_a, 'email', 'Mixed@Example.com', 'manual');
      results := results || jsonb_build_object('test', 'suppressed emails must be lower-case', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'suppressed emails must be lower-case', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.outreach_suppressions (workspace_id, channel, value, reason)
      values (ws_a, 'sms', '619-555-0100', 'stop');
      results := results || jsonb_build_object('test', 'suppressed phones must be +E.164', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'suppressed phones must be +E.164', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    -- @destructive-begin
    delete from public.outreach_suppressions where id = sup_a;
    select count(*) into n from public.outreach_suppressions where id = sup_a;
    results := results || jsonb_build_object('test', 'agent cannot remove a suppression', 'passed', n = 1, 'detail', n);
    -- @destructive-end

    -- Send log.
    insert into public.newsletter_sends (workspace_id, newsletter_id, contact_id, email, status)
    values (ws_a, nl_a, contact_a, 'alpha@example.com', 'queued') returning id, unsubscribe_token into send_q, token_q;
    results := results || jsonb_build_object('test', 'agent logs a queued send', 'passed', send_q is not null, 'detail', send_q);
    insert into public.newsletter_sends (workspace_id, newsletter_id, email, status, blocked_reasons)
    values (ws_a, nl_a, 'blocked@example.com', 'blocked', array['dnc']);
    results := results || jsonb_build_object('test', 'agent logs a blocked send with reasons', 'passed', true, 'detail', null);
    begin
      insert into public.newsletter_sends (workspace_id, newsletter_id, email, status)
      values (ws_a, nl_a, 'fake@example.com', 'sent');
      results := results || jsonb_build_object('test', 'a send can''t be logged as already sent', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'a send can''t be logged as already sent', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.newsletter_sends (workspace_id, newsletter_id, email, status)
      values (ws_a, nl_a, 'noreason@example.com', 'blocked');
      results := results || jsonb_build_object('test', 'a blocked send needs its reasons', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'a blocked send needs its reasons', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    begin
      insert into public.newsletter_sends (workspace_id, newsletter_id, email, status)
      values (ws_a, nl_b, 'cross@example.com', 'queued');
      results := results || jsonb_build_object('test', 'a send can''t point at another workspace''s newsletter', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'a send can''t point at another workspace''s newsletter', 'passed', sqlstate in ('23503', '42501'), 'detail', sqlstate);
    end;
    begin
      update public.newsletter_sends set email = 'other@example.com' where id = send_q;
      results := results || jsonb_build_object('test', 'the recipient of a send can''t be changed', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'the recipient of a send can''t be changed', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    update public.newsletters set status = 'sending' where id = nl_a;
    update public.newsletter_sends set status = 'sent', sent_at = now(), provider_message_id = 'test-1' where id = send_q;
    select count(*) into n from public.activities
     where workspace_id = ws_a and subject_type = 'contact' and subject_id = contact_a
       and type = 'email' and metadata ->> 'send_id' = send_q::text;
    results := results || jsonb_build_object('test', 'a sent email is logged on the contact timeline', 'passed', n = 1, 'detail', n);
    begin
      update public.newsletter_sends set status = 'queued' where id = send_q;
      results := results || jsonb_build_object('test', 'send status can''t go backwards', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'send status can''t go backwards', 'passed', sqlstate = 'P0001', 'detail', sqlstate);
    end;
    -- @destructive-begin
    begin
      delete from public.newsletter_sends where id = send_q;
      results := results || jsonb_build_object('test', 'the send log can''t be deleted', 'passed', false, 'detail', 'deleted');
    exception when others then
      results := results || jsonb_build_object('test', 'the send log can''t be deleted', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    -- @destructive-end
    begin
      update public.newsletters set body = 'Changed after sending' where id = nl_a;
      results := results || jsonb_build_object('test', 'a newsletter locks once sending starts', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'a newsletter locks once sending starts', 'passed', sqlstate = 'P0001', 'detail', sqlstate);
    end;
    begin
      update public.newsletters set status = 'draft' where id = nl_a;
      results := results || jsonb_build_object('test', 'newsletter status can''t go backwards', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'newsletter status can''t go backwards', 'passed', sqlstate = 'P0001', 'detail', sqlstate);
    end;
    -- @destructive-begin
    delete from public.newsletters where id = nl_a;
    select count(*) into n from public.newsletters where id = nl_a;
    results := results || jsonb_build_object('test', 'only drafts can be deleted', 'passed', n = 1, 'detail', n);
    -- @destructive-end

    -- ---------- admin of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_o, 'role', 'authenticated')::text, true);
    insert into public.outreach_settings (workspace_id, sender_name, mailing_address)
    values (ws_a, 'Alpha Co', '1 Alpha St, San Diego, CA');
    select count(*) into n from public.outreach_settings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'admin saves outreach settings', 'passed', n = 1, 'detail', n);
    begin
      update public.outreach_settings set sms_send_until = 22 where workspace_id = ws_a;
      results := results || jsonb_build_object('test', 'texting hours can''t go past 9pm', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'texting hours can''t go past 9pm', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    -- @destructive-begin
    delete from public.outreach_suppressions where id = sup_a;
    select count(*) into n from public.outreach_suppressions where id = sup_a;
    results := results || jsonb_build_object('test', 'admin can remove a suppression', 'passed', n = 0, 'detail', n);
    -- @destructive-end

    -- ---------- viewer of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    select count(*) into n from public.newsletters where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads newsletters', 'passed', n >= 1, 'detail', n);
    begin
      insert into public.newsletters (workspace_id, subject) values (ws_a, 'Viewer attempt');
      results := results || jsonb_build_object('test', 'viewer cannot create newsletters', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot create newsletters', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.outreach_suppressions (workspace_id, channel, value, reason)
      values (ws_a, 'email', 'viewer@example.com', 'manual');
      results := results || jsonb_build_object('test', 'viewer cannot add suppressions', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot add suppressions', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- B cannot see A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    foreach t in array array['outreach_settings', 'outreach_suppressions', 'newsletters', 'newsletter_sends'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_a;
      results := results || jsonb_build_object('test', 'B cannot read A ' || t, 'passed', n = 0, 'detail', n);
    end loop;

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    foreach t in array array['outreach_settings', 'outreach_suppressions', 'newsletters', 'newsletter_sends'] loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', false, 'detail', n);
      exception when others then
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;

    select i.email_hint, i.unsubscribed into t, b from public.outreach_unsubscribe_info(token_q) i;
    results := results || jsonb_build_object('test', 'anon sees only a masked email for a token', 'passed', t = 'a••••@example.com' and not b, 'detail', t);
    select count(*) into n from public.outreach_unsubscribe(gen_random_uuid());
    results := results || jsonb_build_object('test', 'an unknown token does nothing', 'passed', n = 0, 'detail', n);
    perform public.outreach_unsubscribe(token_q);
    perform public.outreach_unsubscribe(token_q);

    -- ---------- back to the owner: check the unsubscribe landed ----------
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.outreach_suppressions
     where workspace_id = ws_a and channel = 'email' and value = 'alpha@example.com' and reason = 'unsubscribe';
    results := results || jsonb_build_object('test', 'one-click unsubscribe adds the email to the do-not-send list', 'passed', n = 1, 'detail', n);
    select email_opt_out into b from public.contacts where id = contact_a;
    results := results || jsonb_build_object('test', 'one-click unsubscribe opts the contact out', 'passed', b, 'detail', b);
    select count(*) into n from public.activities
     where workspace_id = ws_a and subject_id = contact_a and metadata ->> 'kind' = 'unsubscribe';
    results := results || jsonb_build_object('test', 'unsubscribing twice logs once', 'passed', n = 1, 'detail', n);
    select i.unsubscribed into b from public.outreach_unsubscribe_info(token_q) i;
    results := results || jsonb_build_object('test', 'the page then shows "unsubscribed"', 'passed', b, 'detail', b);

    -- ---------- discard all fixtures ----------
    raise exception using errcode = 'RLSOK', message = 'rolling back outreach RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null; -- expected: fixtures rolled back
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$out$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-out-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-out-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_outreach_rls_suite();
