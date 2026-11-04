-- =============================================================================
-- AZH Track (Phase 8) RLS suite: AZH Community (the Network engine on a
-- construction workspace).
--
-- Throwaway users/workspaces in a subtransaction that is ALWAYS rolled back,
-- impersonation through `authenticated` / `anon` + JWT claims. Safe on hosted:
--   node scripts/rls-hosted-sql.mjs supabase/tests/azh_community_rls.sql
--
-- Covers: the member app context, brand and business type work for a
-- construction workspace; AZH member types are accepted (and junk is refused);
-- joining as a GC links/creates the CRM contact with role `gc`, the right source
-- and timeline text; a Community member sees none of AZH's CRM data or another
-- workspace's community; anon gets only brand + business type.
--
-- Run locally: psql "$DB_URL" -f supabase/tests/azh_community_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.azh_community_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $com$
declare
  results jsonb := '[]'::jsonb;
  staff uuid := 'aaaaaaaa-0000-4000-a000-0000000008a1';
  gc_user uuid := 'cccccccc-0000-4000-a000-0000000008c1';
  home_user uuid := 'cccccccc-0000-4000-a000-0000000008c2';
  ws uuid := 'aaaaaaaa-1111-4000-a000-0000000008a1';
  ws_re uuid := 'bbbbbbbb-1111-4000-a000-0000000008b1';
  inv_gc text;
  slug text;
  n bigint;
  t text;
begin
  begin -- fixture subtransaction (always rolled back)

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), '{}', '{}', now(), now()
    from (values (staff, 'azh-com-rls-staff@rls.test'), (gc_user, 'azh-com-rls-gc@rls.test'),
                 (home_user, 'azh-com-rls-home@rls.test')) as u(id, email);

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws, 'Community RLS Builders', 'azh-com-rls-test-a', 'construction', true),
           (ws_re, 'Community RLS Realty', 'azh-com-rls-test-b', 'real_estate', true);
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, staff, 'admin');

    -- AZH CRM data a community member must never see.
    insert into public.contacts (workspace_id, first_name) values (ws, 'Secret Homeowner');
    -- Another workspace's community.
    insert into public.network_members (workspace_id, user_id, display_name)
    values (ws_re, home_user, 'Realty member');
    insert into public.network_posts (workspace_id, author_user_id, title, kind)
    values (ws_re, home_user, 'Realty-only deal', 'deal');

    -- ---------- staff of the construction workspace ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
    select count(*) into n from public.network_context('azh-com-rls-test-a') c where c.is_staff;
    results := results || jsonb_build_object('test', 'AZH staff open the Community member app', 'passed', n = 1, 'detail', n);
    insert into public.network_invites (workspace_id, email, member_type)
    values (ws, 'azh-com-rls-gc@rls.test', 'gc') returning token into inv_gc;
    results := results || jsonb_build_object('test', 'staff invite a GC', 'passed', inv_gc is not null, 'detail', null);
    begin
      insert into public.network_invites (workspace_id, member_type) values (ws, 'plumber');
      results := results || jsonb_build_object('test', 'unknown member types are refused', 'passed', false, 'detail', 'inserted');
    exception when others then
      results := results || jsonb_build_object('test', 'unknown member types are refused', 'passed', sqlstate = '23514', 'detail', sqlstate);
    end;
    insert into public.network_posts (workspace_id, author_user_id, title, kind, property_type, price, city)
    values (ws, staff, 'ADU in North Park', 'deal', 'ADU', 180000, 'San Diego');
    results := results || jsonb_build_object('test', 'staff post a project', 'passed', true, 'detail', null);

    -- ---------- the GC joins ----------
    perform set_config('request.jwt.claims', json_build_object('sub', gc_user, 'role', 'authenticated')::text, true);
    select public.accept_network_invite(inv_gc, 'Gabe Contractor') into slug;
    results := results || jsonb_build_object('test', 'joining returns the community slug', 'passed', slug = 'azh-com-rls-test-a', 'detail', slug);
    select count(*) into n from public.network_context('azh-com-rls-test-a') c where c.member_id is not null and not c.is_staff;
    results := results || jsonb_build_object('test', 'the GC is an active member', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.network_posts;
    results := results || jsonb_build_object('test', 'member reads only their community''s posts', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.contacts;
    results := results || jsonb_build_object('test', 'member sees no CRM contacts', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.network_context('azh-com-rls-test-b');
    results := results || jsonb_build_object('test', 'member cannot open another workspace''s community', 'passed', n = 0, 'detail', n);

    perform set_config('role', 'postgres', true);
    select array_to_string(c.roles, ',') || '|' || c.source || '|' || ('network' = any (c.tags))::text
      into t from public.contacts c where c.workspace_id = ws and 'azh-com-rls-gc@rls.test' = any (c.email_keys);
    results := results || jsonb_build_object('test', 'the CRM contact gets role gc, the Community source and tag',
      'passed', t = 'gc|Community RLS Builders Community|true', 'detail', t);
    select count(*) into n from public.activities a
     where a.workspace_id = ws and a.body = 'Joined the Community RLS Builders Community';
    results := results || jsonb_build_object('test', 'the timeline says which community', 'passed', n = 1, 'detail', n);
    select member_type into t from public.network_members where workspace_id = ws and user_id = gc_user;
    results := results || jsonb_build_object('test', 'member type is kept', 'passed', t = 'gc', 'detail', t);

    -- ---------- anon: install metadata only ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.network_brand('azh-com-rls-test-a');
    results := results || jsonb_build_object('test', 'anon gets the Community brand (install)', 'passed', n = 1, 'detail', n);
    select public.network_business_type('azh-com-rls-test-a') into t;
    results := results || jsonb_build_object('test', 'anon gets the business type (labels)', 'passed', t = 'construction', 'detail', t);
    begin
      select count(*) into n from public.network_context('azh-com-rls-test-a');
      results := results || jsonb_build_object('test', 'anon cannot open the member app', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot open the member app', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'RLSOK', message = 'rolling back AZH Community RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null;
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$com$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'azh-com-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'azh-com-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.azh_community_rls_suite();
