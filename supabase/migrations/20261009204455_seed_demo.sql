-- =============================================================================
-- Seed: Demo workspace sample data (is_demo = true ONLY).
-- Obviously fictional: "Sample"/"Example" surnames, @example.com emails,
-- 555-01xx phone numbers (reserved for fiction), "Sample/Example/Demo" streets,
-- no APNs. Every property value is sourced as "Demo data".
-- Idempotent: skipped if the Demo workspace already has contacts.
-- =============================================================================

do $$
declare
  ws uuid;
  pipe uuid;
  first_names text[] := array['Alex','Jordan','Taylor','Morgan','Casey','Riley','Avery','Quinn','Jamie','Drew',
                              'Reese','Parker','Rowan','Sage','Emerson','Hayden','Kendall','Logan','Peyton','Skyler'];
  role_cycle text[] := array['owner','broker','property_manager','investor','owner','seller','buyer','lender','owner','broker'];
  cities text[] := array['San Diego','San Diego','San Diego','La Mesa','El Cajon','Chula Vista','National City','Escondido'];
  zips text[] := array['92104','92103','92105','91942','92020','91910','91950','92025'];
  demo_src jsonb;
  i integer;
begin
  select id into ws from public.workspaces where slug = 'demo' and is_demo;
  if ws is null then
    raise notice 'Demo workspace missing; skipping demo seed';
    return;
  end if;
  if exists (select 1 from public.contacts where workspace_id = ws) then
    raise notice 'Demo workspace already seeded; skipping';
    return;
  end if;

  select id into pipe from public.pipelines where workspace_id = ws and is_default;

  -- Companies ------------------------------------------------------------------
  insert into public.companies (workspace_id, name, type, website, phone, city, state, tags, notes)
  values
    (ws, 'Example Realty Group',          'brokerage',           'https://example.com',     '(619) 555-0180', 'San Diego',   'CA', '{demo}', 'Fictional brokerage for the demo.'),
    (ws, 'Sample Property Management Co.','property_management', 'https://example.org',     '(619) 555-0181', 'San Diego',   'CA', '{demo}', null),
    (ws, 'Placeholder Capital Lending',   'lender',              'https://example.net',     '(619) 555-0182', 'La Mesa',     'CA', '{demo}', null),
    (ws, 'Demo Ventures LLC',             'investor',            null,                      '(619) 555-0183', 'San Diego',   'CA', '{demo,investor}', null),
    (ws, 'Imaginary Realty Partners',     'brokerage',           'https://example.com/irp', '(619) 555-0184', 'Chula Vista', 'CA', '{demo}', null),
    (ws, 'Mock Holdings Trust',           'investor',            null,                      '(619) 555-0185', 'Escondido',   'CA', '{demo}', null),
    (ws, 'Fictional Builders Inc.',       'gc',                  null,                      '(619) 555-0186', 'El Cajon',    'CA', '{demo}', null),
    (ws, 'Specimen Title & Escrow',       'vendor',              null,                      '(619) 555-0187', 'San Diego',   'CA', '{demo}', null);

  -- Contacts (40) -----------------------------------------------------------------
  for i in 0..39 loop
    insert into public.contacts (
      workspace_id, first_name, last_name, title, roles, emails, phones,
      city, state, zip, source, tags, language,
      dnc, sms_consent, sms_consent_at, sms_consent_source, email_opt_out, email_opt_out_at,
      company_id
    )
    values (
      ws,
      first_names[(i % 20) + 1],
      case when i < 20 then 'Sample' else 'Example' end,
      case role_cycle[(i % 10) + 1]
        when 'broker' then 'Multifamily Broker'
        when 'property_manager' then 'Property Manager'
        when 'lender' then 'Loan Officer'
        when 'investor' then 'Principal'
        else null
      end,
      array[role_cycle[(i % 10) + 1]],
      jsonb_build_array(jsonb_build_object(
        'value', lower(first_names[(i % 20) + 1]) || '.' || case when i < 20 then 'sample' else 'example' end || '@example.com',
        'label', 'work', 'is_primary', true)),
      jsonb_build_array(jsonb_build_object(
        'value', '(619) 555-01' || lpad(i::text, 2, '0'),
        'label', 'mobile', 'type', case when i % 4 = 3 then 'landline' else 'mobile' end, 'is_primary', true)),
      cities[(i % 8) + 1], 'CA', zips[(i % 8) + 1],
      case when i % 3 = 0 then 'Referral' when i % 3 = 1 then 'GHL import' else 'Website' end,
      case when i % 5 = 0 then array['demo','long-hold'] when i % 5 = 1 then array['demo','hot'] else array['demo'] end,
      case when i % 9 = 4 then 'es' else 'en' end,
      i % 13 = 7,
      case when i % 6 = 0 then 'express'::public.sms_consent when i % 11 = 5 then 'written'::public.sms_consent else 'none'::public.sms_consent end,
      case when i % 6 = 0 or i % 11 = 5 then now() - make_interval(days => 30 + i) end,
      case when i % 6 = 0 or i % 11 = 5 then 'Demo data (fictional consent record)' end,
      i % 10 = 9,
      case when i % 10 = 9 then now() - make_interval(days => 10 + i) end,
      case role_cycle[(i % 10) + 1]
        when 'broker' then (select id from public.companies where workspace_id = ws and name = 'Example Realty Group')
        when 'property_manager' then (select id from public.companies where workspace_id = ws and name = 'Sample Property Management Co.')
        when 'lender' then (select id from public.companies where workspace_id = ws and name = 'Placeholder Capital Lending')
        else null
      end
    );
  end loop;

  -- Properties (15) -----------------------------------------------------------------
  demo_src := jsonb_build_object('source', 'demo', 'label', 'Demo data', 'url', null, 'fetched_at', now());

  insert into public.properties (
    workspace_id, name, address, city, state, zip, county, property_type, units, buildings,
    building_sqft, lot_sqft, year_built, zoning, submarket, last_sale_date, last_sale_price, assessed_value,
    owner_contact_id, tags, field_sources
  )
  select
    ws, p.name, p.address, p.city, 'CA', p.zip, 'San Diego', p.ptype, p.units, p.buildings,
    p.sqft, p.lot, p.yb, p.zoning, p.submarket, p.sale_date, p.sale_price, p.assessed,
    (select c.id from public.contacts c
      where c.workspace_id = ws and 'owner' = any (c.roles)
      order by c.created_at, c.first_name offset p.owner_idx limit 1),
    array['demo'],
    (select jsonb_object_agg(f, demo_src)
      from unnest(array['units','buildings','building_sqft','lot_sqft','year_built','zoning',
                        'last_sale_date','last_sale_price','assessed_value','property_type']) f)
  from (values
    ('Sample Ave Apartments',      '3100 Sample Ave',       'San Diego',     '92104', 'multifamily', 24,  2, 18400,  14000, 1964, 'RM-1-1', 'North Park',     date '2009-06-15',  2100000.00,  2650000.00, 0),
    ('Example St Fourplex',        '4415 Example St',       'San Diego',     '92116', 'fourplex',     4,  1,  3600,   6250, 1952, 'RM-1-1', 'Normal Heights', date '1998-03-02',   410000.00,   520000.00, 1),
    ('Demo Blvd Gardens',          '7720 Demo Blvd',        'La Mesa',       '91942', 'multifamily', 48,  4, 39000,  52000, 1971, 'R3',     'La Mesa',        date '2004-11-20',  5200000.00,  6400000.00, 2),
    ('Placeholder Way Triplex',    '2208 Placeholder Way',  'San Diego',     '92102', 'triplex',      3,  1,  2700,   5000, 1948, 'RM-2-4', 'Golden Hill',    date '2001-08-09',   355000.00,   470000.00, 3),
    ('Fictional Ct Duplex',        '1150 Fictional Ct',     'San Diego',     '92105', 'duplex',       2,  1,  1900,   5500, 1958, 'RS-1-7', 'City Heights',   date '1995-01-25',   210000.00,   300000.00, 4),
    ('Specimen Rd Villas',         '9300 Specimen Rd',      'El Cajon',      '92020', 'multifamily', 60,  5, 47000,  81000, 1979, 'RM',     'El Cajon',       date '2011-05-12',  6900000.00,  7800000.00, 5),
    ('Example Plaza Mixed Use',    '500 Example Plaza',     'National City', '91950', 'mixed_use',   16,  1, 15200,  12000, 1986, 'MXD',    'National City',  date '2015-09-30',  3900000.00,  4300000.00, 6),
    ('Sample Terrace',             '1880 Sample Terrace',   'Chula Vista',   '91910', 'multifamily', 36,  3, 28800,  40000, 1983, 'R3',     'Chula Vista',    date '2007-02-14',  4100000.00,  5200000.00, 7),
    ('Demo Heights Apartments',    '6610 Demo Heights Dr',  'San Diego',     '92103', 'multifamily', 80,  6, 64000,  95000, 1968, 'RM-3-7', 'Hillcrest',      date '1999-10-01',  7400000.00, 11200000.00, 8),
    ('Placeholder Park Fourplex',  '3305 Placeholder Park', 'San Diego',     '92104', 'fourplex',     4,  2,  3900,   7000, 1961, 'RM-1-1', 'North Park',     date '2003-04-18',   520000.00,   690000.00, 9),
    ('Example Gardens',            '1200 Example Gardens',  'Escondido',     '92025', 'multifamily', 120, 8, 98000, 210000, 1974, 'R5',     'Escondido',      date '2002-12-05', 11800000.00, 16500000.00, 10),
    ('Sample Commons',             '845 Sample Commons',    'San Diego',     '92105', 'multifamily', 32,  2, 25600,  30000, 1976, 'RM-2-5', 'City Heights',   date '2010-07-22',  3300000.00,  4100000.00, 11),
    ('Fictional Flats',            '2750 Fictional Flats',  'San Diego',     '92116', 'multifamily', 12,  1,  9600,  10000, 1966, 'RM-1-1', 'Kensington',     date '1993-03-11',   760000.00,  1250000.00, 12),
    ('Demo Creek Apartments',      '15010 Demo Creek Rd',   'Escondido',     '92025', 'multifamily', 200, 12, 172000, 410000, 1987, 'R5',   'Escondido',      date '2016-08-30', 32500000.00, 38800000.00, 13),
    ('Specimen Triplex',           '4021 Specimen St',      'El Cajon',      '92020', 'triplex',      3,  1,  2600,   6800, 1955, 'RS',     'El Cajon',       date '1997-06-06',   265000.00,   395000.00, 14)
  ) as p(name, address, city, zip, ptype, units, buildings, sqft, lot, yb, zoning, submarket, sale_date, sale_price, assessed, owner_idx);

  -- Deals (12) — triggers write stage history + "created" activities ---------------
  insert into public.deals (
    workspace_id, pipeline_id, stage_id, title, property_id, primary_contact_id,
    value, asking_price, units, source, expected_close, position, notes
  )
  select
    ws, pipe,
    (select s.id from public.pipeline_stages s where s.pipeline_id = pipe and s.name = d.stage),
    d.title,
    (select pr.id from public.properties pr where pr.workspace_id = ws and pr.name = d.property),
    (select pr.owner_contact_id from public.properties pr where pr.workspace_id = ws and pr.name = d.property),
    d.value, d.asking, d.units, d.source, (current_date + d.close_in), d.pos, 'Demo deal — fictional.'
  from (values
    ('Sample Ave 24-unit acquisition',       'New Deal',     'Sample Ave Apartments',     4950000.00,  5200000.00,  24, 'Demo alert email', 120, 1000),
    ('Example St fourplex — off-market',     'New Deal',     'Example St Fourplex',       1150000.00,  1195000.00,   4, 'Referral',         150, 2000),
    ('Demo Blvd Gardens 48 units',           'Qualified',    'Demo Blvd Gardens',         9800000.00, 10400000.00,  48, 'Broker call',       90, 1000),
    ('Placeholder Way triplex',              'Contacted',    'Placeholder Way Triplex',    985000.00,  1050000.00,   3, 'Direct mail',       75, 1000),
    ('Specimen Rd Villas — 60 units',        'Contacted',    'Specimen Rd Villas',       12300000.00, 12900000.00,  60, 'Broker call',       60, 2000),
    ('Example Plaza mixed-use',              'Interested',   'Example Plaza Mixed Use',   5600000.00,  5950000.00,  16, 'Referral',          45, 1000),
    ('Sample Terrace 36 units',              'Underwriting', 'Sample Terrace',            7900000.00,  8250000.00,  36, 'Demo alert email',  40, 1000),
    ('Demo Heights 80-unit value-add',       'Underwriting', 'Demo Heights Apartments',  19500000.00, 21000000.00,  80, 'Broker call',       35, 2000),
    ('Placeholder Park fourplex',            'Offer',        'Placeholder Park Fourplex', 1240000.00,  1299000.00,   4, 'Website',           21, 1000),
    ('Example Gardens 120 units',            'Offer',        'Example Gardens',          28500000.00, 30000000.00, 120, 'Broker call',       30, 2000),
    ('Fictional Flats 12 units',             'Closed',       'Fictional Flats',           3150000.00,  3300000.00,  12, 'Referral',         -10, 1000),
    ('Demo Creek 200 units',                 'Lost',         'Demo Creek Apartments',    52000000.00, 54500000.00, 200, 'Broker call',      -20, 1000)
  ) as d(title, stage, property, value, asking, units, source, close_in, pos);

  update public.deals
  set lost_reason = 'Seller accepted a higher offer (demo)'
  where workspace_id = ws and title = 'Demo Creek 200 units';

  -- A few contacts on deals
  insert into public.deal_contacts (workspace_id, deal_id, contact_id, role)
  select ws, d.id, c.id, 'Listing broker'
  from public.deals d
  cross join lateral (
    select id from public.contacts
    where workspace_id = ws and 'broker' = any (roles)
    order by first_name, last_name
    limit 1 offset (abs(hashtext(d.title)) % 4)
  ) c
  where d.workspace_id = ws
  on conflict do nothing;

  -- Activities (notes + calls) on contacts
  insert into public.activities (workspace_id, type, subject_type, subject_id, body, occurred_at, metadata)
  select ws,
    case when n % 2 = 0 then 'note'::public.activity_type else 'call'::public.activity_type end,
    'contact', c.id,
    case when n % 2 = 0 then 'Demo note: owner open to a conversation next quarter.'
         else 'Demo call: left voicemail, will follow up.' end,
    now() - make_interval(hours => (n * 7)::integer),
    case when n % 2 = 1 then jsonb_build_object('outcome', 'left_voicemail', 'duration_minutes', 2) else '{}'::jsonb end
  from (
    select id, row_number() over (order by first_name, last_name) as n
    from public.contacts where workspace_id = ws
  ) c
  where c.n <= 12;

  -- Tasks (unassigned until a teammate picks them up)
  insert into public.tasks (workspace_id, title, due_at, status, related_type, related_id)
  select ws, t.title, now() + make_interval(days => t.days), 'open', 'deal',
    (select id from public.deals where workspace_id = ws and title = t.deal)
  from (values
    ('Request T-12 and rent roll (demo)',        'Sample Terrace 36 units',          -1),
    ('Schedule property tour (demo)',            'Demo Blvd Gardens 48 units',        2),
    ('Send LOI draft for review (demo)',         'Placeholder Park fourplex',         1),
    ('Verify ownership with county record (demo)','Specimen Rd Villas — 60 units',    3),
    ('Follow up with listing broker (demo)',     'Example Gardens 120 units',         0),
    ('Underwrite rent upside (demo)',            'Demo Heights 80-unit value-add',    5)
  ) as t(title, deal, days);
end;
$$;
