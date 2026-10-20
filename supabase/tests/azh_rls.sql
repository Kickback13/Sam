-- =============================================================================
-- AZH Track RLS suite (local stack). Same pattern as rls_isolation.sql:
-- throwaway users/workspaces in an always-rolled-back subtransaction, then
-- impersonation through `authenticated` / `anon` + JWT claims.
--
-- Covers: workspace isolation on every azh_* table and both storage buckets,
-- role rules (viewer read-only, admin-only settings), the public intake
-- (anon may INSERT but read nothing), anon storage (upload-only, no read),
-- estimate totals (parity with src/features/azh/estimates/math.ts), deal value
-- sync with change orders, and visit → request status.
--
-- Run: psql "$DB_URL" -f supabase/tests/azh_rls.sql   (or pnpm test:rls)
-- =============================================================================

create or replace function pg_temp.azh_rls_suite()
returns table (test_no bigint, test_name text, ok boolean, info text)
language plpgsql
as $azh$
declare
  results jsonb := '[]'::jsonb;
  user_a uuid := 'aaaaaaaa-0000-4000-a000-0000000000a1';
  user_b uuid := 'bbbbbbbb-0000-4000-a000-0000000000b1';
  user_v uuid := 'cccccccc-0000-4000-a000-0000000000c1';
  ws_a uuid := 'aaaaaaaa-1111-4000-a000-0000000000a1';
  ws_b uuid := 'bbbbbbbb-1111-4000-a000-0000000000b1';
  ws_re uuid := 'dddddddd-1111-4000-a000-0000000000d1';
  pipe_a uuid; pipe_b uuid; stage_a uuid; stage_b uuid;
  deal_a uuid; deal_b uuid; est_a uuid; est_b uuid; req_a uuid; req_b uuid; file_b uuid;
  e record;
  n bigint;
  v numeric;
  t text;
  photo text;
  r record;
begin
  begin -- fixture subtransaction (always rolled back)

    -- ---------- fixtures (as table owner) ----------
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'azh-rls-a@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'azh-rls-b@rls.test', '', now(), '{}', '{}', now(), now()),
      (user_v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'azh-rls-v@rls.test', '', now(), '{}', '{}', now(), now());

    insert into public.workspaces (id, name, slug, business_type, is_demo)
    values (ws_a, 'AZH RLS A', 'azh-rls-test-a', 'construction', true),
           (ws_b, 'AZH RLS B', 'azh-rls-test-b', 'construction', true),
           (ws_re, 'AZH RLS RE', 'azh-rls-test-re', 'real_estate', true);

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_a, user_a, 'agent'), (ws_b, user_b, 'admin'), (ws_a, user_v, 'viewer');

    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_a, 'Projects', 'construction_project', true) returning id into pipe_a;
    insert into public.pipelines (workspace_id, name, kind, is_default) values (ws_b, 'Projects', 'construction_project', true) returning id into pipe_b;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_a, pipe_a, 'Lead', 1) returning id into stage_a;
    insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values (ws_b, pipe_b, 'Lead', 1) returning id into stage_b;
    insert into public.deals (workspace_id, pipeline_id, stage_id, title) values (ws_a, pipe_a, stage_a, 'Alpha job') returning id into deal_a;
    insert into public.deals (workspace_id, pipeline_id, stage_id, title) values (ws_b, pipe_b, stage_b, 'Bravo job') returning id into deal_b;

    insert into public.azh_projects (deal_id, workspace_id, office) values (deal_b, ws_b, 'fallbrook');
    insert into public.azh_estimates (workspace_id, deal_id) values (ws_b, deal_b) returning id into est_b;
    insert into public.azh_estimate_items (workspace_id, estimate_id, description, qty, unit_price) values (ws_b, est_b, 'Bravo line', 1, 10);
    insert into public.azh_requests (workspace_id, deal_id, office) values (ws_b, deal_b, 'san_diego') returning id into req_b;
    insert into public.azh_requests (workspace_id, office) values (ws_a, 'san_diego') returning id into req_a;
    insert into public.azh_files (workspace_id, deal_id, path, name, mime_type, size_bytes, uploaded_by)
      values (ws_b, deal_b, ws_b || '/00000000-0000-4000-a000-000000000001/plan.pdf', 'plan.pdf', 'application/pdf', 10, user_b) returning id into file_b;
    insert into public.azh_visits (workspace_id, deal_id, starts_at, ends_at, office) values (ws_b, deal_b, now(), now() + interval '1 hour', 'san_diego');
    insert into public.azh_milestones (workspace_id, deal_id, name) values (ws_b, deal_b, 'Bravo milestone');
    insert into public.azh_budget_lines (workspace_id, deal_id, category, budgeted) values (ws_b, deal_b, 'Framing', 100);
    insert into public.azh_costs (workspace_id, deal_id, amount, category) values (ws_b, deal_b, 50, 'Framing');
    insert into public.azh_change_orders (workspace_id, deal_id, number, description, amount) values (ws_b, deal_b, 1, 'Bravo CO', 10);
    insert into storage.objects (bucket_id, name) values
      ('azh-files', ws_b || '/00000000-0000-4000-a000-000000000001/plan.pdf'),
      ('azh-intake', ws_b || '/00000000-0000-4000-a000-000000000002/0.jpg');
    -- A3 fixtures: two 2-day-old intake photos, one attached to a request.
    insert into storage.objects (bucket_id, name, created_at) values
      ('azh-intake', ws_b || '/00000000-0000-4000-a000-000000000003/0.jpg', now() - interval '2 days'),
      ('azh-intake', ws_b || '/00000000-0000-4000-a000-000000000004/0.jpg', now() - interval '2 days');
    update public.azh_requests set photo_paths = array[ws_b || '/00000000-0000-4000-a000-000000000004/0.jpg'] where id = req_b;

    -- ---------- defaults created for new construction workspaces ----------
    select count(*) into n from public.azh_settings where workspace_id in (ws_a, ws_b);
    results := results || jsonb_build_object('test', 'construction workspaces get AZH settings', 'passed', n = 2, 'detail', n);
    select count(*) into n from public.azh_settings where workspace_id = ws_re;
    results := results || jsonb_build_object('test', 'real-estate workspaces get no AZH settings', 'passed', n = 0, 'detail', n);
    select count(*) into n from public.azh_zip_routes where workspace_id = ws_a and office = 'fallbrook' and zip = '92028';
    results := results || jsonb_build_object('test', 'default North County ZIPs route to Fallbrook', 'passed', n = 1, 'detail', n);
    t := app_private.azh_route_office(ws_a, '92104-1111');
    results := results || jsonb_build_object('test', 'unlisted ZIP routes to San Diego', 'passed', t = 'san_diego', 'detail', t);
    t := app_private.azh_route_office(ws_a, '92028-1234');
    results := results || jsonb_build_object('test', 'ZIP+4 routes by first five digits', 'passed', t = 'fallbrook', 'detail', t);

    -- ---------- impersonate user A (agent in workspace A) ----------
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    foreach t in array array['azh_settings','azh_zip_routes','azh_projects','azh_estimates','azh_estimate_items',
                             'azh_requests','azh_files','azh_visits','azh_milestones','azh_budget_lines','azh_costs','azh_change_orders'] loop
      execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws_b;
      results := results || jsonb_build_object('test', 'A cannot read B ' || t, 'passed', n = 0, 'detail', n);
    end loop;

    select count(*) into n from storage.objects where bucket_id in ('azh-files', 'azh-intake') and name like ws_b || '/%';
    results := results || jsonb_build_object('test', 'A cannot read B storage objects', 'passed', n = 0, 'detail', n);

    select count(*) into n from public.azh_settings where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'A reads own AZH settings', 'passed', n = 1, 'detail', n);

    update public.azh_settings set cslb_license = '000000' where workspace_id = ws_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'agent cannot change AZH settings (admin only)', 'passed', n = 0, 'detail', n);
    update public.azh_settings set cslb_license = '000000' where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot change B settings', 'passed', n = 0, 'detail', n);

    for r in select * from (values
      ('azh_projects', format('insert into public.azh_projects (deal_id, workspace_id) values (%L, %L)', deal_b, ws_b)),
      ('azh_estimates', format('insert into public.azh_estimates (workspace_id, deal_id, version) values (%L, %L, 9)', ws_b, deal_b)),
      ('azh_requests', format('insert into public.azh_requests (workspace_id, office) values (%L, ''san_diego'')', ws_b)),
      ('azh_change_orders', format('insert into public.azh_change_orders (workspace_id, deal_id, number, description, amount) values (%L, %L, 2, ''x'', 1)', ws_b, deal_b)),
      ('azh_zip_routes', format('insert into public.azh_zip_routes (workspace_id, zip, office) values (%L, ''90001'', ''fallbrook'')', ws_b))
    ) as x(tbl, stmt) loop
      begin
        execute r.stmt;
        results := results || jsonb_build_object('test', 'A cannot insert into B ' || r.tbl, 'passed', false, 'detail', 'insert succeeded');
      exception when others then
        results := results || jsonb_build_object('test', 'A cannot insert into B ' || r.tbl, 'passed', sqlstate = '42501', 'detail', sqlstate || ' ' || sqlerrm);
      end;
    end loop;

    update public.azh_requests set status = 'closed' where id = req_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot update B requests', 'passed', n = 0, 'detail', n);
    delete from public.azh_change_orders where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot delete B change orders', 'passed', n = 0, 'detail', n);
    for t in select unnest(array[ws_a::text, ws_b::text]) loop
      begin
        perform public.azh_unused_intake_photos(t::uuid);
        results := results || jsonb_build_object('test', 'non-admins cannot list uploads for cleanup (' || left(t, 8) || ')', 'passed', false, 'detail', 'listed');
      exception when others then
        results := results || jsonb_build_object('test', 'non-admins cannot list uploads for cleanup (' || left(t, 8) || ')', 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;

    begin
      select count(*) into n from public.azh_intake;
      results := results || jsonb_build_object('test', 'signed-in users cannot read the intake table', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'signed-in users cannot read the intake table', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;

    -- Writing in A: estimate totals are computed by the database.
    insert into public.azh_estimates (workspace_id, deal_id) values (ws_a, deal_a) returning id into est_a;
    select * into e from public.azh_save_estimate(est_a, 'Kitchen', 12.5, 7.75,
      '[{"description":"Drywall sheets","qty":120,"unit":"sheet","unit_price":2.35},
        {"description":"Labor","qty":16,"unit":"hr","unit_price":65},
        {"description":"Fixture","qty":1,"unit_price":349.99}]'::jsonb);
    results := results || jsonb_build_object('test', 'estimate totals match the TS math module',
      'passed', e.subtotal = 1671.99 and e.markup_amount = 209.00 and e.tax_amount = 145.78 and e.total = 2026.77,
      'detail', concat_ws(' ', e.subtotal, e.markup_amount, e.tax_amount, e.total));
    select estimate_total into v from public.azh_projects where deal_id = deal_a;
    results := results || jsonb_build_object('test', 'project estimate_total follows the estimate', 'passed', v = 2026.77, 'detail', v);
    select value into v from public.deals where id = deal_a;
    results := results || jsonb_build_object('test', 'deal value = estimate total before a contract', 'passed', v = 2026.77, 'detail', v);

    update public.azh_estimates set status = 'accepted' where id = est_a;
    select * into e from public.azh_estimates where id = est_a;
    results := results || jsonb_build_object('test', 'accepting sets sent + accepted dates',
      'passed', e.sent_on = current_date and e.accepted_on = current_date and e.declined_on is null, 'detail', concat_ws(' ', e.sent_on, e.accepted_on));

    select * into e from public.azh_duplicate_estimate(est_a);
    results := results || jsonb_build_object('test', 'duplicate to revise creates the next draft version',
      'passed', e.version = 2 and e.status = 'draft' and e.revised_from = est_a and e.total = 2026.77, 'detail', concat_ws(' ', e.version, e.status, e.total));
    select count(*) into n from public.azh_estimate_items where estimate_id = e.id;
    results := results || jsonb_build_object('test', 'revision copies the line items', 'passed', n = 3, 'detail', n);
    select estimate_total into v from public.azh_projects where deal_id = deal_a;
    results := results || jsonb_build_object('test', 'accepted version wins over a newer draft', 'passed', v = 2026.77, 'detail', v);

    update public.azh_projects set contract_value = 48000 where deal_id = deal_a;
    insert into public.azh_change_orders (workspace_id, deal_id, number, description, amount, status)
    values (ws_a, deal_a, 0, 'Extra outlet', 1200.50, 'approved'),
           (ws_a, deal_a, 0, 'Credit: owner-supplied tile', -250.25, 'approved'),
           (ws_a, deal_a, 0, 'Pending upgrade', 999, 'pending');
    select value into v from public.deals where id = deal_a;
    results := results || jsonb_build_object('test', 'approved change orders add to the contract value', 'passed', v = 48950.25, 'detail', v);
    select max(number) into n from public.azh_change_orders where deal_id = deal_a;
    results := results || jsonb_build_object('test', 'change orders are numbered automatically', 'passed', n = 3, 'detail', n);
    update public.azh_change_orders set status = 'approved' where deal_id = deal_a and status = 'pending';
    select value into v from public.deals where id = deal_a;
    results := results || jsonb_build_object('test', 'approving a pending change order updates the value', 'passed', v = 49949.25, 'detail', v);

    insert into public.azh_visits (workspace_id, request_id, starts_at, ends_at, office, estimator_id)
    values (ws_a, req_a, now() + interval '1 day', now() + interval '1 day 1 hour', 'san_diego', user_a);
    select status into t from public.azh_requests where id = req_a;
    results := results || jsonb_build_object('test', 'booking a visit marks the request estimate scheduled', 'passed', t = 'estimate_scheduled', 'detail', t);

    -- A2: changing a request's office moves its project and logs it.
    insert into public.azh_requests (workspace_id, deal_id, office) values (ws_a, deal_a, 'san_diego') returning id into req_a;
    update public.azh_projects set office = 'san_diego' where deal_id = deal_a;
    update public.azh_requests set office = 'fallbrook' where id = req_a;
    select office into t from public.azh_projects where deal_id = deal_a;
    results := results || jsonb_build_object('test', 'request office change moves the project office', 'passed', t = 'fallbrook', 'detail', t);
    select count(*) into n from public.activities where subject_id = deal_a and metadata ->> 'event' = 'azh_office_changed';
    results := results || jsonb_build_object('test', 'office change is logged on the project', 'passed', n = 1, 'detail', n);
    update public.azh_requests set status = 'contacted' where id = req_a;
    select count(*) into n from public.activities where subject_id = deal_a and metadata ->> 'event' = 'azh_office_changed';
    results := results || jsonb_build_object('test', 'non-office updates log nothing', 'passed', n = 1, 'detail', n);

    update public.azh_milestones set status = 'done' where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'A cannot update B milestones', 'passed', n = 0, 'detail', n);

    -- ---------- viewer in A: read-only ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_v, 'role', 'authenticated')::text, true);
    select count(*) into n from public.azh_estimates where workspace_id = ws_a;
    results := results || jsonb_build_object('test', 'viewer reads estimates', 'passed', n = 2, 'detail', n);
    begin
      insert into public.azh_milestones (workspace_id, deal_id, name) values (ws_a, deal_a, 'Viewer milestone');
      results := results || jsonb_build_object('test', 'viewer cannot add milestones', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'viewer cannot add milestones', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    update public.azh_projects set notes = 'viewer' where deal_id = deal_a;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'viewer cannot edit project details', 'passed', n = 0, 'detail', n);

    -- ---------- admin B can change its own settings ----------
    perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    update public.azh_settings set cslb_license = '123456' where workspace_id = ws_b;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'admin updates own AZH settings', 'passed', n = 1, 'detail', n);
    select count(*) into n from storage.objects where bucket_id in ('azh-files', 'azh-intake') and name like ws_b || '/%';
    results := results || jsonb_build_object('test', 'B members read their own storage objects', 'passed', n = 4, 'detail', n);
    select string_agg(u.name, ',') into t from public.azh_unused_intake_photos(ws_b) u;
    results := results || jsonb_build_object('test', 'cleanup lists only old photos not on a request',
      'passed', t = ws_b || '/00000000-0000-4000-a000-000000000003/0.jpg', 'detail', t);

    -- ---------- anon ----------
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

    foreach t in array array['azh_intake','azh_settings','azh_zip_routes','azh_projects','azh_estimates','azh_estimate_items',
                             'azh_requests','azh_files','azh_visits','azh_milestones','azh_budget_lines','azh_costs','azh_change_orders'] loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', n = 0, 'detail', n);
      exception when others then
        results := results || jsonb_build_object('test', 'anon cannot read ' || t, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;

    select count(*) into n from storage.objects where bucket_id in ('azh-files', 'azh-intake');
    results := results || jsonb_build_object('test', 'anon cannot read any AZH bucket', 'passed', n = 0, 'detail', n);

    -- A1: no more direct uploads to arbitrary paths…
    begin
      insert into storage.objects (bucket_id, name) values ('azh-intake', ws_a || '/' || gen_random_uuid() || '/0.jpg');
      results := results || jsonb_build_object('test', 'anon can no longer upload directly to a random intake path', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'anon can no longer upload directly to a random intake path', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    -- …only to a path the server issued a ticket for.
    select t2.path into photo from public.azh_issue_upload_tickets('azh-rls-test-a', '[{"type":"image/jpeg","size":2048}]'::jsonb, '(619) 555-0177', repeat('b', 64)) t2;
    results := results || jsonb_build_object('test', 'upload tickets are issued for open construction forms',
      'passed', photo like ws_a || '/%/0.jpg', 'detail', photo);
    begin
      insert into storage.objects (bucket_id, name) values ('azh-intake', photo);
      results := results || jsonb_build_object('test', 'anon uploads to a ticketed path', 'passed', true, 'detail', 'ok');
    exception when others then
      results := results || jsonb_build_object('test', 'anon uploads to a ticketed path', 'passed', false, 'detail', sqlstate || ' ' || sqlerrm);
    end;
    for r in select * from (values
      ('tickets refuse non-image types', 'azh-rls-test-a', '[{"type":"application/pdf","size":10}]', '(619) 555-0177', '22023'),
      ('tickets refuse files over 10 MB', 'azh-rls-test-a', '[{"type":"image/png","size":10485761}]', '(619) 555-0177', '22023'),
      ('tickets refuse more than 5 photos', 'azh-rls-test-a', '[{"type":"image/png","size":1},{"type":"image/png","size":1},{"type":"image/png","size":1},{"type":"image/png","size":1},{"type":"image/png","size":1},{"type":"image/png","size":1}]', '(619) 555-0177', '22023'),
      ('tickets require a valid phone', 'azh-rls-test-a', '[{"type":"image/png","size":1}]', '555-01', '22023'),
      ('tickets refuse real-estate workspaces', 'azh-rls-test-re', '[{"type":"image/png","size":1}]', '(619) 555-0177', 'PT404')
    ) as x(test, slug, files, phone, code) loop
      begin
        perform public.azh_issue_upload_tickets(r.slug, r.files::jsonb, r.phone);
        results := results || jsonb_build_object('test', r.test, 'passed', false, 'detail', 'ticket issued');
      exception when others then
        results := results || jsonb_build_object('test', r.test, 'passed', sqlstate = r.code, 'detail', sqlstate);
      end;
    end loop;
    begin
      select count(*) into n from public.azh_upload_tickets;
      results := results || jsonb_build_object('test', 'anon cannot read upload tickets', 'passed', false, 'detail', n);
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot read upload tickets', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    for r in select * from (values
      ('anon cannot upload to azh-files', 'azh-files', ws_a || '/' || gen_random_uuid() || '/x.pdf'),
      ('anon cannot upload outside the random-path layout', 'azh-intake', ws_a || '/photo.jpg'),
      ('anon cannot upload for a real-estate workspace', 'azh-intake', ws_re || '/' || gen_random_uuid() || '/0.jpg')
    ) as x(test, bucket, objname) loop
      begin
        insert into storage.objects (bucket_id, name) values (r.bucket, r.objname);
        results := results || jsonb_build_object('test', r.test, 'passed', false, 'detail', 'insert succeeded');
      exception when others then
        results := results || jsonb_build_object('test', r.test, 'passed', sqlstate = '42501', 'detail', sqlstate);
      end;
    end loop;
    update storage.objects set name = name where bucket_id = 'azh-intake';
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'anon cannot overwrite intake photos', 'passed', n = 0, 'detail', n);

    begin
      insert into public.azh_intake (workspace_slug, name, phone, email, job_address, job_zip, service_type, description,
                                     preferred_contact_time, language, photo_paths, sms_consent, consent_text, client_key)
      values ('azh-rls-test-a', 'Sample Homeowner', '(619) 555-0177', 'sample.homeowner@example.com', '1 Example Way', '92028',
              'Drywall', 'Water damage in hallway', 'morning', 'es', array[photo], true, 'I agree to texts', repeat('a', 64));
      results := results || jsonb_build_object('test', 'anon can submit the public request form', 'passed', true, 'detail', 'ok');
    exception when others then
      results := results || jsonb_build_object('test', 'anon can submit the public request form', 'passed', false, 'detail', sqlstate || ' ' || sqlerrm);
    end;

    begin
      insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description, photo_paths)
      values ('azh-rls-test-a', 'Wrong Phone', '(619) 555-0199', '1 Example Way', '92104', 'Drywall', 'x', array[photo]);
      results := results || jsonb_build_object('test', 'intake rejects photos ticketed to another phone', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'intake rejects photos ticketed to another phone', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    begin
      insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description)
      values ('azh-rls-test-a', 'Bad Service', '(619) 555-0178', '1 Example Way', '92104', 'Rocket repair', 'x');
      results := results || jsonb_build_object('test', 'intake rejects unknown service types', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'intake rejects unknown service types', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    begin
      insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description)
      values ('azh-rls-test-re', 'Wrong Workspace', '(619) 555-0179', '1 Example Way', '92104', 'Drywall', 'x');
      results := results || jsonb_build_object('test', 'intake refuses real-estate workspaces', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'intake refuses real-estate workspaces', 'passed', sqlstate = 'PT404', 'detail', sqlstate);
    end;
    begin
      insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description, photo_paths)
      values ('azh-rls-test-a', 'Photo Thief', '(619) 555-0180', '1 Example Way', '92104', 'Drywall', 'x',
              array[ws_b || '/00000000-0000-4000-a000-000000000002/0.jpg']);
      results := results || jsonb_build_object('test', 'intake rejects photos from another workspace', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'intake rejects photos from another workspace', 'passed', sqlstate = '22023', 'detail', sqlstate);
    end;
    begin
      insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description, request_id, processed_at)
      values ('azh-rls-test-a', 'Field Forger', '(619) 555-0181', '1 Example Way', '92104', 'Drywall', 'x', gen_random_uuid(), now());
      results := results || jsonb_build_object('test', 'anon cannot set processing columns', 'passed', false, 'detail', 'insert succeeded');
    exception when others then
      results := results || jsonb_build_object('test', 'anon cannot set processing columns', 'passed', sqlstate = '42501', 'detail', sqlstate);
    end;
    -- Rate limit: 5 per client key per hour (1 above + 4 more succeed, the 6th fails).
    n := 0;
    for i in 1..5 loop
      begin
        insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description, client_key)
        values ('azh-rls-test-a', 'Rate Limited', '(619) 555-01' || (82 + i), '1 Example Way', '92104', 'Painting', 'x', repeat('a', 64));
      exception when others then
        if sqlstate = 'PT429' then n := n + 1; end if;
      end;
    end loop;
    results := results || jsonb_build_object('test', 'per-client rate limit blocks the 6th request in an hour', 'passed', n = 1, 'detail', n);

    -- ---------- verify what the intake created (as table owner) ----------
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);

    select r2.office, r2.status, r2.language, r2.sms_consent, cardinality(r2.photo_paths) as photos,
           c.roles, c.sms_consent::text as consent, c.sms_consent_source, c.language as c_lang,
           d.title, s.name as stage, p.office as p_office, p.service_types
      into e
    from public.azh_requests r2
    join public.contacts c on c.id = r2.contact_id
    join public.deals d on d.id = r2.deal_id
    join public.pipeline_stages s on s.id = d.stage_id
    join public.azh_projects p on p.deal_id = d.id
    where r2.workspace_id = ws_a and r2.source = 'web_form' and c.last_name = 'Homeowner';
    results := results || jsonb_build_object('test', 'intake creates request routed to Fallbrook',
      'passed', e.office = 'fallbrook' and e.status = 'new' and e.language = 'es' and e.photos = 1, 'detail', concat_ws(' ', e.office, e.status, e.language, e.photos));
    results := results || jsonb_build_object('test', 'intake creates a homeowner contact with TCPA consent evidence',
      'passed', 'homeowner' = any (e.roles) and e.consent = 'express' and e.sms_consent_source like 'AZH web request form%' and e.c_lang = 'es',
      'detail', concat_ws(' ', e.roles, e.consent, e.sms_consent_source));
    results := results || jsonb_build_object('test', 'intake creates a Lead deal + project row',
      'passed', e.stage = 'Lead' and e.p_office = 'fallbrook' and e.service_types = array['Drywall'], 'detail', concat_ws(' ', e.stage, e.p_office, e.title));
    select count(*) into n from public.tasks where workspace_id = ws_a and title like '%Sample Homeowner (Fallbrook office)%';
    results := results || jsonb_build_object('test', 'intake creates a task for the routed office', 'passed', n = 1, 'detail', n);
    select count(*) into n from public.activities a
    where a.workspace_id = ws_a and a.metadata ->> 'event' = 'azh_request_received'
      and a.metadata ->> 'request_id' = (select r3.id::text from public.azh_requests r3
                                         join public.contacts c3 on c3.id = r3.contact_id
                                         where r3.workspace_id = ws_a and c3.last_name = 'Homeowner');
    results := results || jsonb_build_object('test', 'intake logs activities on the deal and contact', 'passed', n = 2, 'detail', n);

    -- Same phone again → same contact (dedupe), consent not downgraded.
    perform set_config('role', 'anon', true);
    insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description)
    values ('azh-rls-test-a', 'Sample Homeowner', '619.555.0177', '1 Example Way', '92028', 'Painting', 'Also repaint');
    perform set_config('role', 'postgres', true);
    select count(distinct contact_id) into n from public.azh_requests where workspace_id = ws_a and source = 'web_form' and job_zip = '92028';
    results := results || jsonb_build_object('test', 'repeat submissions dedupe to one contact', 'passed', n = 1, 'detail', n);
    select c.sms_consent::text into t from public.contacts c where c.workspace_id = ws_a and c.last_name = 'Homeowner';
    results := results || jsonb_build_object('test', 'a later request without consent keeps the earlier consent', 'passed', t = 'express', 'detail', t);

    -- ---------- discard all fixtures ----------
    raise exception using errcode = 'RLSOK', message = 'rolling back AZH RLS fixtures';
  exception
    when sqlstate 'RLSOK' then
      null; -- expected: fixtures rolled back
  end;

  return query
  select x.ord, x.val ->> 'test', (x.val ->> 'passed')::boolean, x.val ->> 'detail'
  from jsonb_array_elements(results) with ordinality as x(val, ord)
  order by x.ord;
end;
$azh$;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
  coalesce(string_agg(test_name || ': ' || info, E'\n') filter (where not ok), '') as failures,
  (select count(*) from public.workspaces where slug like 'azh-rls-test-%') as leftover_workspaces,
  (select count(*) from auth.users where email like 'azh-rls-%@rls.test') as leftover_users,
  jsonb_agg(jsonb_build_object('n', test_no, 'test', test_name, 'passed', ok, 'detail', info) order by test_no) as results
from pg_temp.azh_rls_suite();
