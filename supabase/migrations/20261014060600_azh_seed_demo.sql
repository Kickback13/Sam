-- =============================================================================
-- AZH Track: sample data for the AZH Demo workspace (slug demo-azh, is_demo).
-- Obviously fictional: "Sample"/"Example" surnames and company names, 555-01xx
-- phone numbers (reserved for fiction), @example.com emails, "Sample/Example"
-- streets. Never touches any other workspace.
-- Dates are relative to when the migration runs.
-- Idempotent: skipped if the AZH Demo workspace already has contacts.
-- =============================================================================

do $$
declare
  ws uuid;
  pipe uuid;
  st jsonb := '{}'::jsonb;  -- stage name → id
  c uuid[] := '{}';         -- contacts
  d jsonb := '{}'::jsonb;   -- deal key → id
  deal uuid;
  est uuid;
  req uuid;
  i integer;
  first_names text[] := array['Alex','Jordan','Taylor','Morgan','Casey','Riley','Avery','Quinn','Jamie','Drew','Reese','Parker'];
  roles text[] := array['homeowner','homeowner','homeowner','gc','homeowner','investor','homeowner','subcontractor','homeowner','homeowner','gc','homeowner'];
  zips text[] := array['92104','92028','92103','92084','92116','92026','91910','92003','92105','92054','92108','92028'];
  base_day date := (now() at time zone 'America/Los_Angeles')::date;
  demo_consent text := 'Demo data (fictional consent record)';
begin
  select id into ws from public.workspaces where slug = 'demo-azh' and is_demo;
  if ws is null then
    raise notice 'AZH Demo workspace missing; skipping AZH demo seed';
    return;
  end if;
  if exists (select 1 from public.contacts where workspace_id = ws) then
    raise notice 'AZH Demo workspace already seeded; skipping';
    return;
  end if;

  select id into pipe from public.pipelines where workspace_id = ws and is_default;
  select jsonb_object_agg(name, id) into st from public.pipeline_stages where pipeline_id = pipe;

  update public.azh_settings set san_diego_assignee = null, fallbrook_assignee = null where workspace_id = ws;

  -- Companies ------------------------------------------------------------------
  insert into public.companies (workspace_id, name, type, phone, city, state, tags, notes) values
    (ws, 'Example General Contracting', 'gc', '(619) 555-0190', 'San Diego', 'CA', '{demo}', 'Fictional GC partner for the demo.'),
    (ws, 'Sample Drywall Subcontractors', 'subcontractor', '(760) 555-0191', 'Fallbrook', 'CA', '{demo}', null),
    (ws, 'Example Lumber Supply', 'supplier', '(619) 555-0192', 'San Diego', 'CA', '{demo}', null),
    (ws, 'Sample Investor Holdings', 'investor', '(619) 555-0193', 'La Mesa', 'CA', '{demo}', null);

  -- Contacts (12) ---------------------------------------------------------------
  for i in 1..12 loop
    insert into public.contacts (
      workspace_id, first_name, last_name, roles, emails, phones, address, city, state, zip, source, tags, language,
      sms_consent, sms_consent_at, sms_consent_source
    )
    values (
      ws, first_names[i], case when i % 2 = 0 then 'Example' else 'Sample' end, array[roles[i]],
      jsonb_build_array(jsonb_build_object('value', lower(first_names[i]) || '.' || case when i % 2 = 0 then 'example' else 'sample' end || '@example.com', 'label', 'personal', 'is_primary', true)),
      jsonb_build_array(jsonb_build_object('value', '(' || case when zips[i] in ('92028','92084','92026','92003','92054') then '760' else '619' end || ') 555-01' || lpad((i + 40)::text, 2, '0'), 'label', 'mobile', 'type', 'mobile', 'is_primary', true)),
      i * 100 || ' Sample St', case when zips[i] in ('92028','92003') then 'Fallbrook' when zips[i] in ('92084') then 'Vista' when zips[i] = '92026' then 'Escondido' when zips[i] = '92054' then 'Oceanside' when zips[i] = '91910' then 'Chula Vista' else 'San Diego' end,
      'CA', zips[i],
      case when i % 3 = 0 then 'Referral' when i % 3 = 1 then 'AZH request form' else 'GC partner' end,
      array['demo'], case when i in (4, 9) then 'es' else 'en' end,
      case when i in (1, 5, 9) then 'express'::public.sms_consent else 'none'::public.sms_consent end,
      case when i in (1, 5, 9) then now() - make_interval(days => 20 + i) end,
      case when i in (1, 5, 9) then demo_consent end
    )
    returning id into deal;
    c := c || deal;
  end loop;

  -- Projects (deals + azh_projects) ---------------------------------------------
  -- key, title, stage, contact#, office, services, address, zip, contract, start offset, target offset
  for i in 1..9 loop
    insert into public.deals (workspace_id, pipeline_id, stage_id, title, primary_contact_id, source, position, notes)
    select ws, pipe, (st ->> x.stage)::uuid, x.title, c[x.ci], x.src, i * 1000, x.notes
    from (values
      (1, 'Lead',        'Drywall repair — Sample residence',      1, 'AZH request form', 'Water damage in hallway ceiling.'),
      (2, 'Lead',        'Kitchen remodel — Example home',         2, 'Referral',         null),
      (3, 'Estimate',    'ADU build — Sample backyard ADU',        3, 'AZH request form', '650 sq ft detached ADU.'),
      (4, 'Bid Sent',    'Tenant improvement — Example Plaza #4',  4, 'GC partner',       'Office TI, 2,400 sq ft.'),
      (5, 'Won',         'Exterior painting — Sample duplex',      5, 'Referral',         null),
      (6, 'In Progress', 'Full renovation — Example bungalow',     6, 'GC partner',       'Down-to-studs renovation.'),
      (7, 'In Progress', 'Framing package — Sample fourplex',      7, 'GC partner',       null),
      (8, 'Complete',    'Patio slab — Example ranch house',       8, 'AZH request form', null),
      (9, 'Lost',        'Bathroom remodel — Sample condo',        9, 'Referral',         null)
    ) as x(n, stage, title, ci, src, notes)
    where x.n = i
    returning id into deal;
    d := d || jsonb_build_object(i::text, deal);
  end loop;
  update public.deals set lost_reason = 'Homeowner postponed the project (demo)' where id = (d ->> '9')::uuid;

  insert into public.azh_projects (deal_id, workspace_id, job_address, job_zip, service_types, office, source, contract_value, bid_sent_on, start_on, target_on, completed_on, notes)
  values
    ((d ->> '1')::uuid, ws, '100 Sample St', '92104', '{Drywall}',                    'san_diego', 'AZH request form', null,      null, null, null, null, null),
    ((d ->> '2')::uuid, ws, '200 Sample St', '92028', '{Renovation,Carpentry}',       'fallbrook', 'Referral',         null,      null, null, null, null, null),
    ((d ->> '3')::uuid, ws, '300 Sample St', '92103', '{ADU,Framing}',                'san_diego', 'AZH request form', null,      null, null, null, null, 'Permit set in progress (demo).'),
    ((d ->> '4')::uuid, ws, '400 Example Ave', '92084', '{"Tenant improvement",Drywall,Painting}', 'fallbrook', 'GC partner', null, base_day - 6, null, null, null, null),
    ((d ->> '5')::uuid, ws, '500 Sample St', '92116', '{Painting}',                   'san_diego', 'Referral',         18400,     base_day - 20, base_day + 9, base_day + 23, null, null),
    ((d ->> '6')::uuid, ws, '600 Example Ave', '92026', '{Renovation,Framing,Drywall,Painting}', 'fallbrook', 'GC partner', 146384.84, base_day - 60, base_day - 30, base_day + 45, null, null),
    ((d ->> '7')::uuid, ws, '700 Sample St', '91910', '{Framing,Carpentry}',          'san_diego', 'GC partner',       64218.00,     base_day - 40, base_day - 12, base_day + 18, null, null),
    ((d ->> '8')::uuid, ws, '800 Example Ave', '92003', '{"Cement & concrete"}',      'fallbrook', 'AZH request form', 9800,      base_day - 50, base_day - 35, base_day - 30, base_day - 31, null),
    ((d ->> '9')::uuid, ws, '900 Sample St', '92105', '{Renovation}',                 'san_diego', 'Referral',         null,      base_day - 25, null, null, null, null);

  -- Estimates (totals computed by the database triggers) -------------------------
  -- 3: draft v1
  insert into public.azh_estimates (workspace_id, deal_id, version, title, status, markup_pct, tax_pct, valid_until, notes)
  values (ws, (d ->> '3')::uuid, 1, 'Backyard ADU — shell and framing', 'draft', 15, 7.75, base_day + 30, 'Demo estimate. Excludes permits and utility connections.')
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Foundation & slab (650 sq ft)', 650, 'sq ft', 18.50),
    (ws, est, 1, 'Wall & roof framing', 650, 'sq ft', 24.00),
    (ws, est, 2, 'Sheathing & roof underlayment', 1, 'lot', 6850.00),
    (ws, est, 3, 'Windows & exterior doors (supply + install)', 1, 'lot', 9400.00);

  -- 4: sent v1 (awaiting reply)
  insert into public.azh_estimates (workspace_id, deal_id, version, title, status, sent_on, markup_pct, tax_pct, valid_until)
  values (ws, (d ->> '4')::uuid, 1, 'Office TI — Suite 4', 'sent', base_day - 6, 12, 7.75, base_day + 24)
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Demo existing partitions', 1, 'lot', 3200.00),
    (ws, est, 1, 'Metal stud framing', 310, 'lin ft', 21.00),
    (ws, est, 2, 'Drywall hang, tape, Level 4 finish', 4800, 'sq ft', 3.15),
    (ws, est, 3, 'Paint walls & ceilings', 6200, 'sq ft', 1.45),
    (ws, est, 4, 'Doors, frames & hardware', 6, 'ea', 845.00);

  -- 5: accepted v1
  insert into public.azh_estimates (workspace_id, deal_id, version, title, status, sent_on, accepted_on, markup_pct, tax_pct)
  values (ws, (d ->> '5')::uuid, 1, 'Exterior repaint — duplex', 'accepted', base_day - 20, base_day - 14, 0, 0)
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Pressure wash & prep', 1, 'lot', 1900.00),
    (ws, est, 1, 'Stucco elastomeric coating (2 coats)', 3800, 'sq ft', 3.60),
    (ws, est, 2, 'Trim & fascia', 1, 'lot', 2820.00);

  -- 6: declined v1 → accepted v2 (revision)
  insert into public.azh_estimates (workspace_id, deal_id, version, title, status, sent_on, declined_on, markup_pct, tax_pct)
  values (ws, (d ->> '6')::uuid, 1, 'Full renovation', 'declined', base_day - 70, base_day - 64, 15, 7.75)
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Demolition & haul-away', 1, 'lot', 14500.00),
    (ws, est, 1, 'Structural framing & sheer walls', 1, 'lot', 48200.00),
    (ws, est, 2, 'Drywall & finish', 5200, 'sq ft', 3.40),
    (ws, est, 3, 'Interior paint', 5200, 'sq ft', 1.85),
    (ws, est, 4, 'Finish carpentry', 1, 'lot', 39000.00);
  insert into public.azh_estimates (workspace_id, deal_id, version, revised_from, title, status, sent_on, accepted_on, markup_pct, tax_pct, notes)
  values (ws, (d ->> '6')::uuid, 2, est, 'Full renovation (revised scope)', 'accepted', base_day - 62, base_day - 60, 12, 7.75, 'Owner supplies finish flooring (demo).')
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Demolition & haul-away', 1, 'lot', 14500.00),
    (ws, est, 1, 'Structural framing & sheer walls', 1, 'lot', 46800.00),
    (ws, est, 2, 'Drywall & finish', 5200, 'sq ft', 3.25),
    (ws, est, 3, 'Interior paint', 5200, 'sq ft', 1.75),
    (ws, est, 4, 'Finish carpentry', 1, 'lot', 34000.00);

  -- 7: accepted v1
  insert into public.azh_estimates (workspace_id, deal_id, version, title, status, sent_on, accepted_on, markup_pct, tax_pct)
  values (ws, (d ->> '7')::uuid, 1, 'Fourplex framing package', 'accepted', base_day - 40, base_day - 33, 10, 0)
  returning id into est;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price) values
    (ws, est, 0, 'Floor systems (2 levels)', 4200, 'sq ft', 6.25),
    (ws, est, 1, 'Wall framing', 4200, 'sq ft', 5.40),
    (ws, est, 2, 'Roof framing & trusses set', 1, 'lot', 9450.00);

  -- Requests --------------------------------------------------------------------
  insert into public.azh_requests (workspace_id, contact_id, deal_id, status, office, service_type, description, job_address, job_zip,
                                   preferred_contact_time, language, sms_consent, sms_consent_at, sms_consent_text, source, submitted_at)
  values
    (ws, c[1], (d ->> '1')::uuid, 'new', 'san_diego', 'Drywall', 'Water stain and soft spot on the hallway ceiling after a leak.', '100 Sample St', '92104', 'morning', 'en', true, now() - interval '21 days', demo_consent, 'web_form', now() - interval '1 day'),
    (ws, c[10], null, 'new', 'fallbrook', 'Painting', 'Repaint the garage and the side fence.', '1000 Sample St', '92054', 'any', 'en', false, null, null, 'web_form', now() - interval '3 hours'),
    (ws, c[2], (d ->> '2')::uuid, 'contacted', 'fallbrook', 'Renovation', 'Kitchen remodel — new cabinets, move the sink to the island.', '200 Sample St', '92028', 'evening', 'en', false, null, null, 'web_form', now() - interval '4 days'),
    (ws, c[9], null, 'estimate_scheduled', 'san_diego', 'Carpentry', 'Reparar escalera de madera y barandal.', '900 Sample St', '92105', 'afternoon', 'es', true, now() - interval '29 days', demo_consent, 'web_form', now() - interval '5 days'),
    (ws, c[3], (d ->> '3')::uuid, 'converted', 'san_diego', 'ADU', 'Detached ADU in the backyard, about 650 sq ft.', '300 Sample St', '92103', 'morning', 'en', false, null, null, 'web_form', now() - interval '12 days'),
    (ws, c[12], null, 'closed', 'fallbrook', 'Cement & concrete', 'Small walkway — decided to do it themselves.', '1200 Sample St', '92028', 'any', 'en', false, null, null, 'web_form', now() - interval '18 days');

  -- Visits (this week and next) ---------------------------------------------------
  select id into req from public.azh_requests where workspace_id = ws and status = 'estimate_scheduled' limit 1;
  insert into public.azh_visits (workspace_id, request_id, deal_id, starts_at, ends_at, office, address, notes, status) values
    (ws, req, null, ((base_day + 1) + time '10:00') at time zone 'America/Los_Angeles', ((base_day + 1) + time '11:00') at time zone 'America/Los_Angeles', 'san_diego', '900 Sample St 92105', 'Bring the Spanish-language estimate sheet (demo).', 'scheduled'),
    (ws, (select id from public.azh_requests where workspace_id = ws and status = 'converted' limit 1), (d ->> '3')::uuid, ((base_day + 2) + time '09:00') at time zone 'America/Los_Angeles', ((base_day + 2) + time '10:30') at time zone 'America/Los_Angeles', 'san_diego', '300 Sample St 92103', 'Measure lot and setbacks.', 'scheduled'),
    (ws, null, (d ->> '2')::uuid, ((base_day + 3) + time '14:00') at time zone 'America/Los_Angeles', ((base_day + 3) + time '15:00') at time zone 'America/Los_Angeles', 'fallbrook', '200 Sample St 92028', null, 'scheduled'),
    (ws, null, (d ->> '4')::uuid, ((base_day - 9) + time '08:30') at time zone 'America/Los_Angeles', ((base_day - 9) + time '10:00') at time zone 'America/Los_Angeles', 'fallbrook', '400 Example Ave 92084', 'Walked the suite with the property manager.', 'completed');

  -- Milestones ------------------------------------------------------------------
  insert into public.azh_milestones (workspace_id, deal_id, name, planned_on, status, position) values
    (ws, (d ->> '6')::uuid, 'Demolition complete',     base_day - 24, 'done', 0),
    (ws, (d ->> '6')::uuid, 'Framing inspection',      base_day - 3,  'done', 1),
    (ws, (d ->> '6')::uuid, 'Rough MEP inspections',   base_day + 6,  'in_progress', 2),
    (ws, (d ->> '6')::uuid, 'Drywall complete',        base_day + 20, 'planned', 3),
    (ws, (d ->> '6')::uuid, 'Final walkthrough',       base_day + 45, 'planned', 4),
    (ws, (d ->> '7')::uuid, 'Floor systems',           base_day - 6,  'done', 0),
    (ws, (d ->> '7')::uuid, 'Wall framing',            base_day - 1,  'delayed', 1),
    (ws, (d ->> '7')::uuid, 'Roof trusses set',        base_day + 8,  'planned', 2),
    (ws, (d ->> '5')::uuid, 'Prep & pressure wash',    base_day + 9,  'planned', 0);

  -- Budget, costs, change orders ------------------------------------------------
  insert into public.azh_budget_lines (workspace_id, deal_id, category, budgeted, position) values
    (ws, (d ->> '6')::uuid, 'Demolition', 12000, 0),
    (ws, (d ->> '6')::uuid, 'Framing', 38000, 1),
    (ws, (d ->> '6')::uuid, 'Drywall', 15000, 2),
    (ws, (d ->> '6')::uuid, 'Paint', 8000, 3),
    (ws, (d ->> '6')::uuid, 'Finish carpentry', 26000, 4),
    (ws, (d ->> '6')::uuid, 'Permits', 4500, 5),
    (ws, (d ->> '7')::uuid, 'Lumber', 28000, 0),
    (ws, (d ->> '7')::uuid, 'Labor', 22000, 1);
  insert into public.azh_costs (workspace_id, deal_id, spent_on, vendor, amount, category, notes) values
    (ws, (d ->> '6')::uuid, base_day - 28, 'Example Disposal Co.', 4850.00, 'Demolition', '2 roll-off dumpsters'),
    (ws, (d ->> '6')::uuid, base_day - 25, 'Sample Demo Crew', 8600.00, 'Demolition', null),
    (ws, (d ->> '6')::uuid, base_day - 18, 'Example Lumber Supply', 21430.75, 'Framing', 'Framing lumber + hardware'),
    (ws, (d ->> '6')::uuid, base_day - 10, 'Sample Framing Labor', 14200.00, 'Framing', null),
    (ws, (d ->> '6')::uuid, base_day - 32, 'County of San Diego (demo)', 4720.00, 'Permits', 'Building permit (fictional)'),
    (ws, (d ->> '6')::uuid, base_day - 4, 'Example Equipment Rental', 640.00, 'Equipment', 'Not in the budget — shows as unbudgeted'),
    (ws, (d ->> '7')::uuid, base_day - 14, 'Example Lumber Supply', 17980.40, 'Lumber', null),
    (ws, (d ->> '7')::uuid, base_day - 7, 'Sample Framing Labor', 9600.00, 'Labor', null);
  insert into public.azh_change_orders (workspace_id, deal_id, number, description, amount, status) values
    (ws, (d ->> '6')::uuid, 1, 'Add beam at kitchen opening (engineer letter)', 6200.00, 'approved'),
    (ws, (d ->> '6')::uuid, 2, 'Credit: owner supplies flooring', -3500.00, 'approved'),
    (ws, (d ->> '6')::uuid, 3, 'Upgrade to solid-core interior doors', 2850.00, 'pending'),
    (ws, (d ->> '7')::uuid, 1, 'Additional blocking for cabinets', 1150.00, 'pending');

  -- Tasks -------------------------------------------------------------------------
  insert into public.tasks (workspace_id, title, due_at, related_type, related_id) values
    (ws, 'Call new homeowner request: Alex Sample (San Diego office)', now() + interval '2 hours', 'deal', (d ->> '1')::uuid),
    (ws, 'Follow up on TI estimate (sent 6 days ago)', now() - interval '1 day', 'deal', (d ->> '4')::uuid),
    (ws, 'Order roof trusses', now() + interval '3 days', 'deal', (d ->> '7')::uuid),
    (ws, 'Schedule rough MEP inspection', now() + interval '1 day', 'deal', (d ->> '6')::uuid);
end;
$$;
