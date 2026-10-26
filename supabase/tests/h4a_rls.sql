-- =============================================================================
-- Housing4All Track (Phase 2A) RLS suite: Deal Engine tables and functions.
--
-- Same pattern as rls_isolation.sql: throwaway users/workspaces created in a
-- subtransaction that is ALWAYS rolled back, then impersonation through the
-- `authenticated` / `anon` roles + JWT claims (exactly how PostgREST runs).
-- Safe to run on the hosted project after the h4a migrations are applied:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_rls.sql
-- (the hosted variant drops the @destructive block, like rls_isolation.sql).
--
-- Covers: workspace isolation on every h4a_* table; anon gets no table access;
-- viewers read-only; agents can't edit the buy box or see the forwarding
-- address; listings/events/emails/alerts can only be written through the
-- h4a_* functions; dedupe + source precedence; one alert per listing; scores
-- tied to the buy-box version; verify/dismiss rules; promote → property + deal
-- in New Deal; and the inbound email path (anon + forwarding-address token)
-- writing only into its own workspace.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $h4a$
declare
  results jsonb := '[]'::jsonb;
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000004a1';
  user_m uuid := 'aaaaaaaa-0000-4000-a000-0000000004a2';
  user_v uuid := 'aaaaaaaa-0000-4000-a000-0000000004a3';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000004b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000004a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000004b1';
  token_a text := 'aaaaaaaaaaaaaaaaaaaa';
  token_b text := 'bbbbbbbbbbbbbbbbbbbb';
  pipe_a uuid;
  listing_a uuid;
  listing_a2 uuid;
  listing_b uuid;
  email_b uuid;
  email_in uuid;
  inbound_listing uuid;
  res jsonb;
  n bigint;
  t text;
  r record;
  ok_dummy boolean;
begin
  begin -- fixture subtransaction (always rolled back)

    -- ---------- fixtures (as table owner) ----------
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-rls-a@rls.test', '', now(), '{}', '{"full_name":"RLS Agent"}', now(), now()),
      (user_m, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-rls-m@rls.test', '', now(), '{}', '{"full_name":"RLS Admin"}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-rls-v@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'h4a-rls-b@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'H4A RLS A', 'h4a-rls-test-a', 'real_estate', true),
           (ws_b, 'H4A RLS B', 'h4a-rls-test-b', 'real_estate', true);

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_a, 'agent'), (ws_a, user_m, 'admin'), (ws_a, user_v, 'viewer'), (ws_b, user_b, 'admin');

    insert into public.pipelines (workspace_id, name, kind, is_default)
    values (ws_a, 'Acquisitions', 'acquisition', true) returning id into pipe_a;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, is_won, is_lost)
    values (ws_a, pipe_a, 'New Deal', 1, false, false),
           (ws_a, pipe_a, 'Closed', 7, true, false),
           (ws_a, pipe_a, 'Lost', 8, false, true);

    insert into public.h4a_buy_boxes (workspace_id, zips, max_price_per_unit, alert_threshold)
    values (ws_a, '{92104}', 250000, 70), (ws_b, '{91910}', 300000, 70);
    insert into public.h4a_inbound_addresses (workspace_id, token_hash, token_hint)
    values (ws_a, encode(extensions.digest(token_a, 'sha256'), 'hex'), 'aaaa'),
           (ws_b, encode(extensions.digest(token_b, 'sha256'), 'hex'), 'bbbb');

    insert into public.h4a_inbound_emails (workspace_id, channel, subject, text_body, body_status)
    values (ws_b, 'demo', 'Bravo email', 'body', 'stored') returning id into email_b;
    listing_b := (app_private.h4a_ingest_one(ws_b, null, jsonb_build_object(
      'origin', 'demo', 'source', jsonb_build_object('label', 'Bravo source'),
      'fields', jsonb_build_object('address', '1 Bravo St', 'zip', '91910', 'price', 1000000, 'units', 4),
      'keys', jsonb_build_object('street_key', '1 bravo st', 'match_keys', jsonb_build_array('addr:1 bravo st|91910'))
    ), email_b) ->> 'listing_id')::uuid;
    insert into public.h4a_alerts (workspace_id, listing_id, score, threshold) values (ws_b, listing_b, 90, 70);
    insert into public.h4a_imports (workspace_id, filename) values (ws_b, 'bravo.csv');

    -- ---------- impersonate A (agent in workspace A) ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    foreach t in array array['h4a_buy_boxes', 'h4a_inbound_emails', 'h4a_listings', 'h4a_listing_events', 'h4a_alerts', 'h4a_imports'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_b;
      results := results || jsonb_build_object('test', 'A cannot read B ' || t, 'passed', n = 0, 'detail', n);
    end loop;

    select count(*) into n from public.h4a_inbound_addresses;
    results := results || jsonb_build_object('test', 'agent cannot read forwarding addresses (admin only)', 'passed', n = 0, 'detail', n);

    select count(*) into n from public.h4a_buy_boxes where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'A reads own buy box', 'passed', n = 1, 'detail', n);

    res := public.h4a_ingest_listings(ws_a, jsonb_build_array(jsonb_build_object(
      'origin', 'manual', 'source', jsonb_build_object('label', 'Entered by Somebody Else'),
      'fields', jsonb_build_object('address', '3100 Sample Ave', 'city', 'San Diego', 'zip', '92104', 'price', 4800000, 'units', 24),
      'keys', jsonb_build_object('street_key', '3100 sample ave',
        'match_keys', jsonb_build_array('addr:3100 sample ave|92104', 'addr:3100 sample ave|san diego'))
    )));
    listing_a := (res -> 'results' -> 0 ->> 'listing_id')::uuid;
    results := results || jsonb_build_object('test', 'agent creates a manual listing through h4a_ingest_listings',
      'passed', res -> 'results' -> 0 ->> 'action' = 'created', 'detail', res -> 'results' -> 0 ->> 'action');
    select field_sources -> 'price' ->> 'label' into t from public.h4a_listings where id = listing_a;
    results := results || jsonb_build_object('test', 'manual source label is the signed-in user (not the caller''s text)',
      'passed', t = 'Entered by RLS Agent', 'detail', t);
    results := results || jsonb_build_object('test', 'ingest returns the buy box for scoring',
      'passed', (res -> 'buy_box' ->> 'version')::int = 1, 'detail', res -> 'buy_box' ->> 'version');

    begin
      insert into public.h4a_listings (workspace_id, origin, source_label, address, street_key)
      values (ws_a, 'manual', 'x', '9 Direct St', '9 direct st');
      results := results || jsonb_build_object('test', 'users cannot insert listings directly', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'users cannot insert listings directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      update public.h4a_listings set price = 1 where id = listing_a;
      results := results || jsonb_build_object('test', 'users cannot update listings directly', 'passed', false, 'detail', 'update succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'users cannot update listings directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_listing_events (workspace_id, listing_id, kind) values (ws_a, listing_a, 'created');
      results := results || jsonb_build_object('test', 'users cannot forge listing history', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'users cannot forge listing history', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_alerts (workspace_id, listing_id, score, threshold) values (ws_a, listing_a, 99, 70);
      results := results || jsonb_build_object('test', 'users cannot create alerts directly', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'users cannot create alerts directly', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    begin
      perform public.h4a_ingest_listings(ws_b, jsonb_build_array(jsonb_build_object(
        'origin', 'manual', 'fields', jsonb_build_object('address', '2 Intruder St'),
        'keys', jsonb_build_object('street_key', '2 intruder st', 'match_keys', jsonb_build_array('addr:2 intruder st|')))));
      results := results || jsonb_build_object('test', 'A cannot ingest into B', 'passed', false, 'detail', 'ingested');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot ingest into B', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    res := public.h4a_ingest_listings(ws_a, jsonb_build_array(jsonb_build_object(
      'origin', 'email', 'source', jsonb_build_object('label', 'Forged email'),
      'fields', jsonb_build_object('address', '5 Forged Way'),
      'keys', jsonb_build_object('street_key', '5 forged way', 'match_keys', jsonb_build_array('addr:5 forged way|')))));
    results := results || jsonb_build_object('test', 'session path refuses the email origin (inbound only)',
      'passed', res -> 'results' -> 0 ->> 'action' = 'error' and res -> 'results' -> 0 ->> 'code' = '42501',
      'detail', res -> 'results' -> 0);

    -- Dedupe: same building written differently, no ZIP → updates, never duplicates.
    res := public.h4a_ingest_listings(ws_a, jsonb_build_array(jsonb_build_object(
      'origin', 'csv', 'source', jsonb_build_object('label', 'CSV: test.csv'),
      'fields', jsonb_build_object('address', '3100 Sample Avenue', 'city', 'San Diego', 'units', 23, 'year_built', 1964),
      'keys', jsonb_build_object('street_key', '3100 sample ave', 'match_keys', jsonb_build_array('addr:3100 sample ave|san diego')))));
    select count(*) into n from public.h4a_listings where workspace_id = ws_a and street_key = '3100 sample ave';
    results := results || jsonb_build_object('test', 'repeat listing updates the existing one (no duplicate)',
      'passed', n = 1 and res -> 'results' -> 0 ->> 'action' = 'updated', 'detail', n || ' ' || (res -> 'results' -> 0 ->> 'action'));
    select units::text into t from public.h4a_listings where id = listing_a;
    results := results || jsonb_build_object('test', 'a CSV value never overwrites a manual one (kept + logged)',
      'passed', t = '24' and res -> 'results' -> 0 -> 'kept' ? 'units', 'detail', t);
    select count(*) into n from public.h4a_listing_events where listing_id = listing_a and kind = 'updated' and changes -> 'changed' ? 'year_built';
    results := results || jsonb_build_object('test', 'the change is recorded in history', 'passed', n = 1, 'detail', n);

    -- Different APN at the same address = a different parcel.
    res := public.h4a_ingest_listings(ws_a, jsonb_build_array(
      jsonb_build_object('origin', 'manual', 'fields', jsonb_build_object('address', '7 Twin Ct', 'zip', '92104', 'apn', '111-111-11-11'),
        'keys', jsonb_build_object('street_key', '7 twin ct', 'apn_key', '1111111111', 'match_keys', jsonb_build_array('apn:1111111111', 'addr:7 twin ct|92104'))),
      jsonb_build_object('origin', 'manual', 'fields', jsonb_build_object('address', '7 Twin Ct', 'zip', '92104', 'apn', '222-222-22-22'),
        'keys', jsonb_build_object('street_key', '7 twin ct', 'apn_key', '2222222222', 'match_keys', jsonb_build_array('apn:2222222222', 'addr:7 twin ct|92104')))));
    select count(*) into n from public.h4a_listings where workspace_id = ws_a and street_key = '7 twin ct';
    results := results || jsonb_build_object('test', 'conflicting APNs never merge', 'passed', n = 2, 'detail', n);
    listing_a2 := (res -> 'results' -> 0 ->> 'listing_id')::uuid;

    -- Scores + alerts
    res := public.h4a_save_scores(ws_a, jsonb_build_array(
      jsonb_build_object('listing_id', listing_a, 'score', 85, 'breakdown', '[]'::jsonb, 'buy_box_version', 1)), array[listing_a]);
    results := results || jsonb_build_object('test', 'a new listing at/above the threshold creates one alert',
      'passed', jsonb_array_length(res -> 'alerts') = 1, 'detail', res);
    res := public.h4a_save_scores(ws_a, jsonb_build_array(
      jsonb_build_object('listing_id', listing_a, 'score', 90, 'breakdown', '[]'::jsonb, 'buy_box_version', 1)), array[listing_a]);
    results := results || jsonb_build_object('test', 'never a second alert for the same listing',
      'passed', jsonb_array_length(res -> 'alerts') = 0, 'detail', res);
    res := public.h4a_save_scores(ws_a, jsonb_build_array(
      jsonb_build_object('listing_id', listing_a2, 'score', 95, 'breakdown', '[]'::jsonb, 'buy_box_version', 1)), '{}');
    results := results || jsonb_build_object('test', 're-scoring (not alertable) never alerts',
      'passed', jsonb_array_length(res -> 'alerts') = 0 and (res ->> 'saved')::int = 1, 'detail', res);
    res := public.h4a_save_scores(ws_a, jsonb_build_array(
      jsonb_build_object('listing_id', listing_a2, 'score', 10, 'breakdown', '[]'::jsonb, 'buy_box_version', 0)), '{}');
    results := results || jsonb_build_object('test', 'a score from an older buy-box version is ignored (stale)',
      'passed', (res ->> 'stale')::int = 1 and (res ->> 'saved')::int = 0, 'detail', res);
    begin
      perform public.h4a_save_scores(ws_b, jsonb_build_array(
        jsonb_build_object('listing_id', listing_b, 'score', 1, 'breakdown', '[]'::jsonb, 'buy_box_version', 1)), '{}');
      results := results || jsonb_build_object('test', 'A cannot score B listings', 'passed', false, 'detail', 'saved');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot score B listings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    update public.h4a_buy_boxes set max_price_per_unit = 1 where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'agent cannot change the buy box (admin only)', 'passed', n = 0, 'detail', n);

    -- Verification and status rules
    begin
      perform public.h4a_verify_listing(ws_a, listing_a, 'verified', null, null);
      results := results || jsonb_build_object('test', 'verifying requires a note and a source', 'passed', false, 'detail', 'verified');
    exception when others then
      results := results || jsonb_build_object('test', 'verifying requires a note and a source', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    perform public.h4a_verify_listing(ws_a, listing_a, 'verified', 'Units and owner match', 'SD County Assessor');
    select verification_status || '|' || (verified_by = user_a)::text into t from public.h4a_listings where id = listing_a;
    results := results || jsonb_build_object('test', 'verification is saved with the user', 'passed', t = 'verified|true', 'detail', t);
    begin
      perform public.h4a_set_listing_status(ws_a, listing_a2, 'dismiss', null);
      results := results || jsonb_build_object('test', 'dismissing requires a reason', 'passed', false, 'detail', 'dismissed');
    exception when others then
      results := results || jsonb_build_object('test', 'dismissing requires a reason', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    t := public.h4a_set_listing_status(ws_a, listing_a2, 'dismiss', 'Not a fit');
    t := t || '>' || public.h4a_set_listing_status(ws_a, listing_a2, 'restore');
    results := results || jsonb_build_object('test', 'dismiss and restore', 'passed', t = 'dismissed>new', 'detail', t);

    -- Promote → property + deal in New Deal + activities, idempotent
    res := public.h4a_promote_listing(ws_a, listing_a);
    select count(*) into n from public.deals d
      join public.pipeline_stages s on s.id = d.stage_id
      where d.id = (res ->> 'deal_id')::uuid and s.name = 'New Deal' and d.property_id = (res ->> 'property_id')::uuid;
    results := results || jsonb_build_object('test', 'promote creates a deal in New Deal linked to the property', 'passed', n = 1, 'detail', res);
    select count(*) into n from public.properties
      where id = (res ->> 'property_id')::uuid and units = 24 and field_sources -> 'units' ->> 'label' = 'Entered by RLS Agent';
    results := results || jsonb_build_object('test', 'the property copies listing fields with their sources', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities
      where subject_id in ((res ->> 'deal_id')::uuid, (res ->> 'property_id')::uuid) and metadata ->> 'event' = 'listing_promoted';
    results := results || jsonb_build_object('test', 'promotion is logged on the deal and the property', 'passed', n = 2, 'detail', n);
    select status into t from public.h4a_listings where id = listing_a;
    res := public.h4a_promote_listing(ws_a, listing_a);
    results := results || jsonb_build_object('test', 'promoting twice returns the same deal',
      'passed', t = 'promoted' and (res ->> 'already')::boolean, 'detail', res);
    begin
      perform public.h4a_promote_listing(ws_b, listing_b);
      results := results || jsonb_build_object('test', 'A cannot promote B listings', 'passed', false, 'detail', 'promoted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot promote B listings', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.h4a_promote_listing(ws_a, listing_b);
      results := results || jsonb_build_object('test', 'B listing is not found from A workspace', 'passed', false, 'detail', 'promoted');
    exception when others then
      results := results || jsonb_build_object('test', 'B listing is not found from A workspace', 'passed', sqlstate = 'P0002', 'detail', sqlstate);
    end;

    n := public.h4a_mark_alerts_read(ws_a);
    results := results || jsonb_build_object('test', 'members mark their alerts read', 'passed', n = 1, 'detail', n);
    begin
      perform public.h4a_mark_alerts_read(ws_b);
      results := results || jsonb_build_object('test', 'A cannot touch B alerts', 'passed', false, 'detail', 'marked');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot touch B alerts', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.h4a_create_email(ws_a, jsonb_build_object('text_body', 'x'));
      results := results || jsonb_build_object('test', 'agents cannot use Paste an email (admin tool)', 'passed', false, 'detail', 'created');
    exception when others then
      results := results || jsonb_build_object('test', 'agents cannot use Paste an email (admin tool)', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.h4a_imports (workspace_id, filename) values (ws_b, 'intruder.csv');
      results := results || jsonb_build_object('test', 'A cannot create imports in B', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'A cannot create imports in B', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- impersonate V (viewer in workspace A) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    select count(*) into n from public.h4a_listings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads listings', 'passed', n >= 3, 'detail', n);
    for r in select * from (values
      ('ingest', format('select public.h4a_ingest_listings(%L, %L::jsonb)', ws_a, '[]')),
      ('verify', format('select public.h4a_verify_listing(%L, %L, ''verified'', ''n'', ''s'')', ws_a, listing_a2)),
      ('dismiss', format('select public.h4a_set_listing_status(%L, %L, ''dismiss'', ''x'')', ws_a, listing_a2)),
      ('promote', format('select public.h4a_promote_listing(%L, %L)', ws_a, listing_a2)),
      ('score', format('select public.h4a_save_scores(%L, %L::jsonb)', ws_a, '[]'))
    ) as x(what, stmt) loop
      begin
        execute r.stmt;
        results := results || jsonb_build_object('test', 'viewer cannot ' || r.what, 'passed', false, 'detail', 'allowed');
      exception when others then
        results := results || jsonb_build_object('test', 'viewer cannot ' || r.what, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;

    -- ---------- impersonate M (admin in workspace A) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_m, 'role', 'authenticated')::text, true);
    update public.h4a_buy_boxes set max_price_per_unit = 200000 where workspace_id = ws_a;
    get diagnostics n = row_count;
    select version into n from public.h4a_buy_boxes where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'admin edits the buy box and its version goes up', 'passed', n = 2, 'detail', n);
    select count(*) into n from public.h4a_inbound_addresses;
    results := results || jsonb_build_object('test', 'admin sees only their own forwarding address', 'passed', n = 1, 'detail', n);
    update public.h4a_buy_boxes set zips = '{}' where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'admin of A cannot edit B buy box', 'passed', n = 0, 'detail', n);
    select public.h4a_create_email(ws_a, jsonb_build_object('text_body', 'Pasted text', 'subject', 'Pasted')) is not null into ok_dummy;
    results := results || jsonb_build_object('test', 'admins can paste an email', 'passed', true, 'detail', 'created');

    -- ---------- impersonate B (admin in workspace B) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.h4a_listings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot read A listings', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.h4a_inbound_emails where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B cannot read A emails', 'passed', n = 0, 'detail', n);

    -- @destructive-begin
    delete from public.h4a_buy_boxes where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'B cannot delete A buy box', 'passed', n = 0, 'detail', n);
    -- @destructive-end

    -- ---------- anon (and the inbound email path) ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    foreach t in array array['h4a_buy_boxes', 'h4a_inbound_emails', 'h4a_inbound_addresses', 'h4a_listings', 'h4a_listing_events', 'h4a_alerts', 'h4a_imports'] loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', n = 0, 'detail', n);
      exception when others then
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;
    begin
      perform public.h4a_ingest_listings(ws_a, '[]'::jsonb);
      results := results || jsonb_build_object('test', 'anon cannot call session functions', 'passed', false, 'detail', 'called');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot call session functions', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.h4a_inbound_receive('cccccccccccccccccccc', jsonb_build_object('provider_email_id', 'x1'));
      results := results || jsonb_build_object('test', 'inbound: an unknown address token is refused', 'passed', false, 'detail', 'received');
    exception when others then
      results := results || jsonb_build_object('test', 'inbound: an unknown address token is refused', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    res := public.h4a_inbound_receive(token_a, jsonb_build_object(
      'provider_email_id', 'rls-email-1', 'from', 'LoopNet <alerts@loopnet.example>', 'subject', 'New listing', 'to', jsonb_build_array('deals.x@in.example')));
    email_in := (res ->> 'email_id')::uuid;
    results := results || jsonb_build_object('test', 'inbound: the token reaches its own workspace only',
      'passed', (res ->> 'workspace_id')::uuid = ws_a and res ->> 'workspace_slug' = 'h4a-rls-test-a', 'detail', res);
    res := public.h4a_inbound_receive(token_a, jsonb_build_object('provider_email_id', 'rls-email-1'));
    results := results || jsonb_build_object('test', 'inbound: a retried webhook is recorded once',
      'passed', (res ->> 'duplicate')::boolean and (res ->> 'email_id')::uuid = email_in, 'detail', res);

    res := public.h4a_inbound_ingest(token_a, email_in, jsonb_build_array(
      jsonb_build_object('origin', 'email', 'source', jsonb_build_object('label', 'LoopNet alert'),
        'fields', jsonb_build_object('address', '4415 Example St', 'zip', '92104', 'price', 2640000, 'units', 12),
        'keys', jsonb_build_object('street_key', '4415 example st', 'match_keys', jsonb_build_array('addr:4415 example st|92104'))),
      jsonb_build_object('origin', 'manual', 'fields', jsonb_build_object('address', '6 Sneaky Rd'),
        'keys', jsonb_build_object('street_key', '6 sneaky rd', 'match_keys', jsonb_build_array('addr:6 sneaky rd|')))));
    inbound_listing := (res -> 'results' -> 0 ->> 'listing_id')::uuid;
    results := results || jsonb_build_object('test', 'inbound: email listings are created',
      'passed', res -> 'results' -> 0 ->> 'action' = 'created', 'detail', res -> 'results' -> 0 ->> 'action');
    results := results || jsonb_build_object('test', 'inbound: only the email origin is accepted',
      'passed', res -> 'results' -> 1 ->> 'action' = 'error', 'detail', res -> 'results' -> 1);
    begin
      perform public.h4a_inbound_ingest(token_b, email_in, '[]'::jsonb);
      results := results || jsonb_build_object('test', 'inbound: another workspace''s token can''t use this email', 'passed', false, 'detail', 'allowed');
    exception when others then
      results := results || jsonb_build_object('test', 'inbound: another workspace''s token can''t use this email', 'passed', sqlstate = 'P0002', 'detail', sqlstate);
    end;
    res := public.h4a_inbound_save_scores(token_a, email_in, jsonb_build_array(
      jsonb_build_object('listing_id', inbound_listing, 'score', 100, 'breakdown', '[]'::jsonb, 'buy_box_version', 2),
      jsonb_build_object('listing_id', listing_b, 'score', 0, 'breakdown', '[]'::jsonb, 'buy_box_version', 2),
      jsonb_build_object('listing_id', listing_a2, 'score', 0, 'breakdown', '[]'::jsonb, 'buy_box_version', 2)));
    results := results || jsonb_build_object('test', 'inbound: scores only listings this email touched, and alerts',
      'passed', (res ->> 'saved')::int = 1 and jsonb_array_length(res -> 'alerts') = 1, 'detail', res);
    perform public.h4a_inbound_update_email(token_a, email_in, jsonb_build_object('parse_status', 'parsed', 'listing_count', 1));
    begin
      perform public.h4a_inbound_update_email(token_b, email_in, jsonb_build_object('parse_status', 'failed'));
      results := results || jsonb_build_object('test', 'inbound: another token can''t update this email', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'inbound: another token can''t update this email', 'passed', sqlstate = 'P0002', 'detail', sqlstate);
    end;

    -- Back to the owner role to check what the inbound path wrote.
    perform set_config('role', 'postgres', true);
    select count(*) into n from public.h4a_listings where id = inbound_listing and workspace_id = ws_a
      and field_sources -> 'price' ->> 'source' = 'email' and field_sources -> 'price' ->> 'label' = 'LoopNet alert';
    results := results || jsonb_build_object('test', 'inbound: the listing landed in A with an email source', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.h4a_listings where workspace_id = ws_b and street_key = '6 sneaky rd';
    results := results || jsonb_build_object('test', 'inbound: nothing leaked into B', 'passed', n = 0, 'detail', n);
    select parse_status into t from public.h4a_inbound_emails where id = email_in;
    results := results || jsonb_build_object('test', 'inbound: email parse status recorded', 'passed', t = 'parsed', 'detail', t);
    select count(*) into n from public.h4a_listing_events where email_id = email_in and listing_id = inbound_listing;
    results := results || jsonb_build_object('test', 'inbound: listing is linked to the email that produced it', 'passed', n = 1, 'detail', n);

    -- ---------- discard all fixtures ----------
    raise exception using errcode = 'RLSOK', message = 'rolling back H4A RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null; -- expected: fixtures rolled back
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$h4a$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_rls_suite();
