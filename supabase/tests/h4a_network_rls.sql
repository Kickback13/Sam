-- =============================================================================
-- Housing4All Track (Phase 6A) RLS suite: the Housing4All Network.
--
-- Same pattern as the other suites: throwaway users/workspaces in a
-- subtransaction that is ALWAYS rolled back, impersonation through
-- `authenticated` / `anon` + JWT claims. Safe on hosted after the migration:
--   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_network_rls.sql
--
-- Covers: a network member sees NO CRM data (contacts, deals, properties,
-- activities, invites) and nothing from another workspace; members read the
-- feed, events and directory; authorship is forced; only staff pin, hide,
-- create events or change segments; hidden posts and unlisted members stay
-- hidden; RSVPs are per person; removed members lose access; joining links an
-- existing CRM contact by email or creates one; email-bound and revoked invites
-- are refused; anon gets only the invite lookup.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/h4a_network_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.h4a_network_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $net$
declare
  results jsonb := '[]'::jsonb;
  staff_a uuid := 'aaaaaaaa-0000-4000-a000-0000000006a1';
  viewer_a uuid := 'aaaaaaaa-0000-4000-a000-0000000006a3';
  mem_m uuid := 'cccccccc-0000-4000-a000-0000000006c1';
  mem_n uuid := 'cccccccc-0000-4000-a000-0000000006c2';
  new_u uuid := 'cccccccc-0000-4000-a000-0000000006c3';
  new_w uuid := 'cccccccc-0000-4000-a000-0000000006c4';
  staff_b uuid := 'bbbbbbbb-0000-4000-a000-0000000006b1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000006a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000006b1';
  member_m uuid;
  member_n uuid;
  contact_existing uuid;
  post_staff uuid;
  post_hidden uuid;
  post_m uuid;
  event_a uuid;
  inv_open text;
  inv_bound text;
  inv_revoked text;
  n bigint;
  t text;
  b boolean;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (staff_a, 'h4a-net-rls-staff@rls.test'), (viewer_a, 'h4a-net-rls-viewer@rls.test'),
                 (mem_m, 'h4a-net-rls-m@rls.test'), (mem_n, 'h4a-net-rls-n@rls.test'),
                 (new_u, 'h4a-net-rls-existing@rls.test'), (new_w, 'h4a-net-rls-new@rls.test'),
                 (staff_b, 'h4a-net-rls-b@rls.test')) as u(id, email);

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'Network RLS A', 'h4a-net-rls-test-a', 'real_estate', true),
           (ws_b, 'Network RLS B', 'h4a-net-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, staff_a, 'agent'), (ws_a, viewer_a, 'viewer'), (ws_b, staff_b, 'admin');

    -- CRM data in A that members must never see.
    insert into public.contacts (workspace_id, first_name, emails)
    values (ws_a, 'Existing', '[{"value": "h4a-net-rls-existing@rls.test", "is_primary": true}]')
    returning id into contact_existing;
    insert into public.properties (workspace_id, address, zip, units) values (ws_a, '1 Secret St', '92104', 10);

    insert into public.network_members (workspace_id, user_id, display_name, member_type, show_in_directory)
    values (ws_a, mem_m, 'Member M', 'investor', true) returning id into member_m;
    insert into public.network_members (workspace_id, user_id, display_name, member_type, show_in_directory)
    values (ws_a, mem_n, 'Member N (unlisted)', 'broker', false) returning id into member_n;
    insert into public.network_members (workspace_id, user_id, display_name)
    values (ws_b, mem_n, 'N in B (removed)') ;
    update public.network_members set status = 'removed' where workspace_id = ws_b and user_id = mem_n;

    insert into public.network_posts (workspace_id, author_user_id, title, body, pinned)
    values (ws_a, staff_a, 'Welcome', 'Hi all', true) returning id into post_staff;
    insert into public.network_posts (workspace_id, author_user_id, author_member_id, title, hidden_at)
    values (ws_a, mem_n, member_n, 'Spam', now()) returning id into post_hidden;
    insert into public.network_posts (workspace_id, author_user_id, title) values (ws_b, staff_b, 'B only');
    insert into public.network_events (workspace_id, title, starts_at)
    values (ws_a, 'Meetup', now() + interval '7 days') returning id into event_a;

    insert into public.network_invites (workspace_id, email, member_type) values (ws_a, 'h4a-net-rls-existing@rls.test', 'lender')
      returning token into inv_bound;
    insert into public.network_invites (workspace_id, name) values (ws_a, 'New Person') returning token into inv_open;
    insert into public.network_invites (workspace_id, revoked_at) values (ws_a, now()) returning token into inv_revoked;

    -- ---------- member M ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', mem_m, 'role', 'authenticated')::text, true);

    foreach t in array array['contacts', 'deals', 'properties', 'activities', 'tasks', 'companies'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_a;
      results := results || jsonb_build_object('test', 'member sees no CRM ' || t, 'passed', n = 0, 'detail', n);
    end loop;
    select count(*) into n from public.network_invites;
    results := results || jsonb_build_object('test', 'member cannot see invites', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.network_posts where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'member cannot see another network', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.network_posts where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'member reads the feed (not hidden posts)', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.network_members where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'directory hides unlisted members', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.network_events where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'member reads events', 'passed', n = 1, 'detail', n);

    insert into public.network_posts (workspace_id, kind, title, units, price, pinned, author_member_id)
    values (ws_a, 'deal', '12 units in North Park', 12, 3000000, true, member_n) returning id into post_m;
    select author_member_id = member_m and not pinned and author_user_id = mem_m into b from public.network_posts where id = post_m;
    results := results || jsonb_build_object('test', 'member posts as themselves (authorship forced, no pin)', 'passed', b, 'detail', b);
    begin
      update public.network_posts set pinned = true where id = post_m;
      results := results || jsonb_build_object('test', 'member cannot pin', 'passed', false, 'detail', 'pinned');
    exception when others then
      results := results || jsonb_build_object('test', 'member cannot pin', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    update public.network_posts set title = 'Staff post edited' where id = post_staff;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'member cannot edit others'' posts', 'passed', n = 0, 'detail', n);
    insert into public.network_comments (workspace_id, post_id, body) values (ws_a, post_staff, 'Thanks!');
    results := results || jsonb_build_object('test', 'member comments on a post', 'passed', true, 'detail', null);
    begin
      insert into public.network_comments (workspace_id, post_id, body) values (ws_a, post_hidden, 'x');
      results := results || jsonb_build_object('test', 'member cannot comment on a hidden post', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'member cannot comment on a hidden post', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    update public.network_members set headline = 'Value-add investor', public_email = 'm@example.com' where id = member_m;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'member edits own profile', 'passed', n = 1, 'detail', n);
    begin
      update public.network_members set tags = array['vip'] where id = member_m;
      results := results || jsonb_build_object('test', 'member cannot change own segments', 'passed', false, 'detail', 'updated');
    exception when others then
      results := results || jsonb_build_object('test', 'member cannot change own segments', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    insert into public.network_rsvps (workspace_id, event_id) values (ws_a, event_a);
    results := results || jsonb_build_object('test', 'member RSVPs', 'passed', true, 'detail', null);
    begin
      insert into public.network_rsvps (workspace_id, event_id, user_id) values (ws_a, event_a, mem_n);
      results := results || jsonb_build_object('test', 'member cannot RSVP for someone else', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'member cannot RSVP for someone else', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      insert into public.network_events (workspace_id, title, starts_at) values (ws_a, 'Member event', now());
      results := results || jsonb_build_object('test', 'member cannot create events', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'member cannot create events', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select c.member_id = member_m and not c.is_staff into b from public.network_context('h4a-net-rls-test-a') c;
    results := results || jsonb_build_object('test', 'member gets the app context', 'passed', coalesce(b, false), 'detail', b);
    select count(*) into n from public.network_context('h4a-net-rls-test-b');
    results := results || jsonb_build_object('test', 'no context for a network you''re not in', 'passed', n = 0, 'detail', n);

    -- ---------- member N: removed from B, unlisted in A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', mem_n, 'role', 'authenticated')::text, true);
    select count(*) into n from public.network_posts where workspace_id = ws_b;
    results := results || jsonb_build_object('test', 'a removed member loses access', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.network_posts where id = post_hidden;
    results := results || jsonb_build_object('test', 'authors still see their own hidden post', 'passed', n = 1, 'detail', n);

    -- ---------- staff (agent) of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'role', 'authenticated')::text, true);
    select count(*) into n from public.network_members where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'staff see every member incl. unlisted', 'passed', n = 2, 'detail', n);
    update public.network_posts set hidden_at = now(), hidden_by = staff_a where id = post_m;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'staff hide a post', 'passed', n = 1, 'detail', n);
    update public.network_members set tags = array['vip'] where id = member_m;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'staff set segments', 'passed', n = 1, 'detail', n);
    insert into public.network_events (workspace_id, title, starts_at) values (ws_a, 'Webinar', now() + interval '1 day');
    results := results || jsonb_build_object('test', 'staff create events', 'passed', true, 'detail', null);
    insert into public.network_posts (workspace_id, title, author_member_id) values (ws_a, 'Market note', member_m)
      returning author_member_id is null into b;
    results := results || jsonb_build_object('test', 'staff post as the business (no member author)', 'passed', b, 'detail', b);

    -- ---------- viewer of A ----------
    perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
    begin
      insert into public.network_invites (workspace_id) values (ws_a);
      results := results || jsonb_build_object('test', 'viewer cannot invite', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot invite', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- ---------- staff of B ----------
    perform set_config('request.jwt.claims', json_build_object('sub', staff_b, 'role', 'authenticated')::text, true);
    select count(*) into n from public.network_members where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'B staff cannot see A members', 'passed', n = 0, 'detail', n);

    -- ---------- joining ----------
    perform set_config('request.jwt.claims', json_build_object('sub', new_w, 'role', 'authenticated')::text, true);
    begin
      perform public.accept_network_invite(inv_bound, 'Wrong Person');
      results := results || jsonb_build_object('test', 'an email-bound invite refuses other emails', 'passed', false, 'detail', 'joined');
    exception when others then
      results := results || jsonb_build_object('test', 'an email-bound invite refuses other emails', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    begin
      perform public.accept_network_invite(inv_revoked, 'X');
      results := results || jsonb_build_object('test', 'a revoked invite is refused', 'passed', false, 'detail', 'joined');
    exception when others then
      results := results || jsonb_build_object('test', 'a revoked invite is refused', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    select public.accept_network_invite(inv_open, 'Nora New') into t;
    results := results || jsonb_build_object('test', 'joining returns the network slug', 'passed', t = 'h4a-net-rls-test-a', 'detail', t);
    select count(*) into n from public.my_networks();
    results := results || jsonb_build_object('test', 'the new member lands in the network', 'passed', n = 1, 'detail', n);

    perform set_config('request.jwt.claims', json_build_object('sub', new_u, 'role', 'authenticated')::text, true);
    perform public.accept_network_invite(inv_bound, 'Existing Contact');

    perform set_config('role', 'postgres', true);
    select count(*) into n from public.contacts
     where workspace_id = ws_a and 'h4a-net-rls-new@rls.test' = any (email_keys)
       and source = 'Housing4All Network' and 'network' = any (tags);
    results := results || jsonb_build_object('test', 'joining creates a CRM contact when none exists', 'passed', n = 1, 'detail', n);
    select m.contact_id = contact_existing and 'network' = any (c.tags) and 'lender' = any (c.roles) into b
      from public.network_members m join public.contacts c on c.id = m.contact_id
     where m.workspace_id = ws_a and m.user_id = new_u;
    results := results || jsonb_build_object('test', 'joining links the existing CRM contact by email', 'passed', coalesce(b, false), 'detail', b);
    select count(*) into n from public.contacts where workspace_id = ws_a and 'h4a-net-rls-existing@rls.test' = any (email_keys);
    results := results || jsonb_build_object('test', 'no duplicate contact is created', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities
     where workspace_id = ws_a and subject_id = contact_existing and metadata ->> 'kind' = 'network_join';
    results := results || jsonb_build_object('test', 'the join is on the contact timeline', 'passed', n = 1, 'detail', n);

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
      select count(*) into n from public.network_posts;
      results := results || jsonb_build_object('test', 'anon cannot read the feed', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read the feed', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    select i.status into t from public.get_network_invite(inv_bound) i;
    results := results || jsonb_build_object('test', 'anon can look up an invite (status only)', 'passed', t = 'accepted', 'detail', t);
    begin
      perform public.accept_network_invite(inv_open, 'anon');
      results := results || jsonb_build_object('test', 'anon cannot join', 'passed', false, 'detail', 'joined');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot join', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    raise exception using errcode = 'RLSOK', message = 'rolling back network RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$net$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'h4a-net-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'h4a-net-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.h4a_network_rls_suite();
