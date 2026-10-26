-- =============================================================================
-- Housing4All Track (Phase 2A): Deal Finder sample data — Demo workspace ONLY.
--
-- Touches only the workspace with slug 'demo' and is_demo = true; does nothing
-- if it isn't there, and nothing if it already has listings (idempotent).
-- Everything is fictional and labeled: "Sample/Example/Placeholder" streets,
-- 555-01xx phones, @example.com emails, .example links. The four emails are the
-- PLACEHOLDER fixtures from src/features/h4a/email/fixtures (not real alerts).
-- Listings go through app_private.h4a_ingest_one so sources and history are
-- real. Scores are left for the app to compute (the Deal Finder re-scores
-- unscored listings on first open); tests/rls/h4a-demo-seed.test.ts checks the
-- seeded alert scores match the scoring module.
-- =============================================================================

do $$
declare
  ws uuid;
  e_loopnet uuid;
  e_crexi uuid;
  e_broker uuid;
  e_blast uuid;
  l_sample uuid;
  l_example uuid;
  l_fictional uuid;
  l_placeholder uuid;
  l_ridge uuid;
  l_specimen uuid;
  v_prop uuid;
  v_deal uuid;
  src_time text := (now() - interval '2 days')::text;
begin
  select id into ws from public.workspaces where slug = 'demo' and is_demo;
  if ws is null then
    raise notice 'Demo workspace missing; skipping Deal Finder demo seed';
    return;
  end if;
  if exists (select 1 from public.h4a_listings where workspace_id = ws) then
    raise notice 'Demo Deal Finder already seeded; skipping';
    return;
  end if;

  -- Sample buy box --------------------------------------------------------------
  insert into public.h4a_buy_boxes (
    workspace_id, zips, cities, submarkets, property_types, units_min, units_max,
    price_max, max_price_per_unit, year_built_min, year_built_max, notes, alert_threshold
  )
  values (
    ws,
    array['92102', '92103', '92104', '92105', '92116', '91942', '92020'],
    array['San Diego', 'La Mesa', 'El Cajon'],
    array['North Park', 'City Heights', 'Golden Hill'],
    array['multifamily', 'duplex', 'triplex', 'fourplex'],
    2, 60, 12000000, 260000, 1950, 1995,
    'Sample buy box for the Demo workspace (fictional criteria).',
    70
  )
  on conflict (workspace_id) do nothing;

  -- Placeholder emails (already parsed) -------------------------------------------
  insert into public.h4a_inbound_emails (
    workspace_id, channel, from_address, subject, received_at, text_body, body_status,
    parse_status, parser_key, parser_label, confidence, listing_count, parse_notes
  )
  values (
    ws, 'demo', '"LoopNet (placeholder)" <alerts@loopnet.example>',
    '[PLACEHOLDER] 2 new listings match your saved search "SD Multifamily 10-60 units"',
    now() - interval '2 days',
    $txt$PLACEHOLDER SAMPLE - made-up email for tests. Not a real LoopNet message.

Your saved search "SD Multifamily 10-60 units" has 2 new matches.

1. Sample Ave Apartments
3100 Sample Ave, San Diego, CA 92104
Multifamily | 24 Units | Built 1964
Price: $4,950,000 ($206,250/Unit)
Cap Rate: 5.2%
Building Size: 18,400 SF | Lot: 14,000 SF
View Listing: https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/
Listed by Pat Sample, Example Realty Group, (619) 555-0190

2. Example Terrace
4415 Example St, San Diego, CA 92116
Multifamily | 12 Units | Built 1958
Price: $2,640,000 ($220,000/Unit)
View Listing: https://www.loopnet.example/Listing/4415-Example-St-San-Diego-CA/10000002/
Listed by Jordan Example, Imaginary Realty Partners, (619) 555-0191$txt$,
    'stored', 'parsed', 'loopnet-saved-search', 'LoopNet saved-search alert (placeholder format)', 'high', 2,
    '["Demo data: placeholder email, not a real LoopNet message."]'::jsonb
  )
  returning id into e_loopnet;

  insert into public.h4a_inbound_emails (
    workspace_id, channel, from_address, subject, received_at, text_body, body_status,
    parse_status, parser_key, parser_label, confidence, listing_count, parse_notes
  )
  values (
    ws, 'demo', 'Crexi (placeholder) <notifications@crexi.example>',
    '[PLACEHOLDER] New listing matches your saved search: Sample Court Fourplex',
    now() - interval '1 day',
    $txt$PLACEHOLDER SAMPLE - made-up email for tests. Not a real Crexi message.

New listing matches your saved search
Sample Court Fourplex
1150 Fictional Ct, San Diego, CA 92105
Asking Price | $1,195,000
Property Type | Multifamily
Units | 4
Price/Unit | $298,750
Year Built | 1958
Cap Rate | 4.8%
Square Footage | 3,600 SF
Lot Size | 5,500 SF
APN | 999-000-00-01
Broker: Casey Example · Sample Property Advisors · (619) 555-0192 · casey.example@example.com$txt$,
    'stored', 'parsed', 'crexi-new-listing', 'Crexi new-listing alert (placeholder format)', 'high', 1,
    '["Demo data: placeholder email, not a real Crexi message."]'::jsonb
  )
  returning id into e_crexi;

  insert into public.h4a_inbound_emails (
    workspace_id, channel, from_address, subject, received_at, text_body, body_status,
    parse_status, parser_key, parser_label, confidence, listing_count, parse_notes
  )
  values (
    ws, 'demo', 'Sam Placeholder <sam.placeholder@example.com>',
    '[PLACEHOLDER] Fwd: Off-market triplex in Golden Hill',
    now() - interval '20 hours',
    $txt$---------- Forwarded message ---------
From: Morgan Example <morgan.example@example.com>
Subject: Off-market triplex in Golden Hill

PLACEHOLDER SAMPLE - made-up email for tests.

Hi Sam,

I have an off-market triplex at 2208 Placeholder Way, San Diego, CA 92102 - asking $985,000. Built in 1948, about 2,700 sq ft on a 5,000 sq ft lot. Two of the three units are vacant.

Morgan Example
Example Brokerage Co.
(619) 555-0193$txt$,
    'stored', 'parsed', 'generic', 'Generic reader (fallback)', 'medium', 1,
    '["Demo data: placeholder email."]'::jsonb
  )
  returning id into e_broker;

  insert into public.h4a_inbound_emails (
    workspace_id, channel, from_address, subject, received_at, text_body, body_status,
    parse_status, parser_key, parser_label, confidence, listing_count, parse_notes
  )
  values (
    ws, 'demo', 'Riley Example <riley.example@example.com>',
    '[PLACEHOLDER] New offering in La Mesa',
    now() - interval '6 hours',
    $txt$PLACEHOLDER SAMPLE - made-up email for tests.

New offering: 4500 Placeholder Pkwy, La Mesa. Priced at $2,200,000. Call for the rent roll.

Riley Example
(619) 555-0194$txt$,
    'stored', 'parsed', 'generic', 'Generic reader (fallback)', 'medium', 1,
    '["Demo data: placeholder email."]'::jsonb
  )
  returning id into e_blast;

  -- Listings (through the real ingest function) ----------------------------------
  l_sample := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · placeholder LoopNet alert',
      'url', 'https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/', 'fetched_at', src_time),
    'fields', jsonb_build_object('address', '3100 Sample Ave', 'city', 'San Diego', 'zip', '92104',
      'property_type', 'multifamily', 'price', 4950000, 'units', 24, 'cap_rate', 5.2, 'year_built', 1964,
      'building_sqft', 18400, 'lot_sqft', 14000, 'submarket', 'North Park',
      'broker_name', 'Pat Sample', 'broker_company', 'Example Realty Group', 'broker_phone', '(619) 555-0190',
      'listing_url', 'https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/'),
    'keys', jsonb_build_object('street_key', '3100 sample ave',
      'match_keys', jsonb_build_array('addr:3100 sample ave|92104', 'addr:3100 sample ave|san diego')),
    'review', jsonb_build_object('needs_review', false, 'confidence', 'high')
  ), e_loopnet) ->> 'listing_id')::uuid;

  l_example := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · placeholder LoopNet alert',
      'url', 'https://www.loopnet.example/Listing/4415-Example-St-San-Diego-CA/10000002/', 'fetched_at', src_time),
    'fields', jsonb_build_object('address', '4415 Example St', 'city', 'San Diego', 'zip', '92116',
      'property_type', 'multifamily', 'price', 2640000, 'units', 12, 'year_built', 1958,
      'broker_name', 'Jordan Example', 'broker_company', 'Imaginary Realty Partners', 'broker_phone', '(619) 555-0191',
      'listing_url', 'https://www.loopnet.example/Listing/4415-Example-St-San-Diego-CA/10000002/'),
    'keys', jsonb_build_object('street_key', '4415 example st',
      'match_keys', jsonb_build_array('addr:4415 example st|92116', 'addr:4415 example st|san diego')),
    'review', jsonb_build_object('needs_review', false, 'confidence', 'high')
  ), e_loopnet) ->> 'listing_id')::uuid;

  l_fictional := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · placeholder Crexi alert',
      'url', 'https://www.crexi.example/properties/900001/sample-court-fourplex',
      'fetched_at', (now() - interval '1 day')::text),
    'fields', jsonb_build_object('address', '1150 Fictional Ct', 'city', 'San Diego', 'zip', '92105',
      'apn', '999-000-00-01', 'property_type', 'multifamily', 'price', 1195000, 'units', 4, 'cap_rate', 4.8,
      'year_built', 1958, 'building_sqft', 3600, 'lot_sqft', 5500, 'submarket', 'City Heights',
      'broker_name', 'Casey Example', 'broker_company', 'Sample Property Advisors', 'broker_phone', '(619) 555-0192',
      'broker_email', 'casey.example@example.com',
      'listing_url', 'https://www.crexi.example/properties/900001/sample-court-fourplex'),
    'keys', jsonb_build_object('street_key', '1150 fictional ct', 'apn_key', '9990000001',
      'match_keys', jsonb_build_array('apn:9990000001', 'addr:1150 fictional ct|92105', 'addr:1150 fictional ct|san diego')),
    'review', jsonb_build_object('needs_review', false, 'confidence', 'high')
  ), e_crexi) ->> 'listing_id')::uuid;

  l_placeholder := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · placeholder broker email',
      'fetched_at', (now() - interval '20 hours')::text),
    'fields', jsonb_build_object('address', '2208 Placeholder Way', 'city', 'San Diego', 'zip', '92102',
      'property_type', 'triplex', 'price', 985000, 'units', 3, 'year_built', 1948,
      'building_sqft', 2700, 'lot_sqft', 5000, 'submarket', 'Golden Hill',
      'broker_name', 'Morgan Example', 'broker_company', 'Example Brokerage Co.',
      'broker_phone', '(619) 555-0193', 'broker_email', 'morgan.example@example.com'),
    'keys', jsonb_build_object('street_key', '2208 placeholder way',
      'match_keys', jsonb_build_array('addr:2208 placeholder way|92102', 'addr:2208 placeholder way|san diego')),
    'review', jsonb_build_object('needs_review', true, 'confidence', 'medium',
      'reasons', jsonb_build_array('Read by the generic fallback reader — check every field'))
  ), e_broker) ->> 'listing_id')::uuid;

  perform app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · placeholder broker email',
      'fetched_at', (now() - interval '6 hours')::text),
    'fields', jsonb_build_object('address', '4500 Placeholder Pkwy', 'city', 'La Mesa', 'price', 2200000,
      'broker_name', 'Riley Example', 'broker_email', 'riley.example@example.com', 'broker_phone', '(619) 555-0194'),
    'keys', jsonb_build_object('street_key', '4500 placeholder pkwy',
      'match_keys', jsonb_build_array('addr:4500 placeholder pkwy|la mesa')),
    'review', jsonb_build_object('needs_review', true, 'confidence', 'medium',
      'reasons', jsonb_build_array('No unit count found', 'Read by the generic fallback reader — check every field'))
  ), e_blast);

  l_ridge := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · manual entry example', 'fetched_at', (now() - interval '3 days')::text),
    'fields', jsonb_build_object('address', '9020 Sample Ridge Rd', 'city', 'El Cajon', 'zip', '92020',
      'property_type', 'multifamily', 'price', 9720000, 'units', 36, 'year_built', 1979,
      'building_sqft', 29800, 'broker_name', 'Avery Sample', 'broker_phone', '(619) 555-0195'),
    'keys', jsonb_build_object('street_key', '9020 sample ridge rd',
      'match_keys', jsonb_build_array('addr:9020 sample ridge rd|92020', 'addr:9020 sample ridge rd|el cajon'))
  ), null) ->> 'listing_id')::uuid;

  perform app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · CSV upload example', 'fetched_at', (now() - interval '4 days')::text),
    'fields', jsonb_build_object('address', '1880 Example Terrace', 'city', 'Chula Vista', 'zip', '91910',
      'property_type', 'multifamily', 'price', 6300000, 'units', 30, 'cap_rate', 5.6, 'year_built', 1983),
    'keys', jsonb_build_object('street_key', '1880 example ter',
      'match_keys', jsonb_build_array('addr:1880 example ter|91910', 'addr:1880 example ter|chula vista'))
  ), null);

  perform app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · CSV upload example', 'fetched_at', (now() - interval '4 days')::text),
    'fields', jsonb_build_object('address', '560 Demo Way', 'city', 'Escondido', 'zip', '92025',
      'property_type', 'multifamily', 'price', 21000000, 'units', 120, 'year_built', 1974),
    'keys', jsonb_build_object('street_key', '560 demo way',
      'match_keys', jsonb_build_array('addr:560 demo way|92025', 'addr:560 demo way|escondido'))
  ), null);

  l_specimen := (app_private.h4a_ingest_one(ws, null, jsonb_build_object(
    'origin', 'demo',
    'source', jsonb_build_object('label', 'Demo data · CSV upload example', 'fetched_at', (now() - interval '5 days')::text),
    'fields', jsonb_build_object('address', '77 Specimen Ln', 'city', 'San Diego', 'zip', '92103',
      'property_type', 'mixed_use', 'price', 3900000, 'units', 8, 'year_built', 1926),
    'keys', jsonb_build_object('street_key', '77 specimen ln',
      'match_keys', jsonb_build_array('addr:77 specimen ln|92103', 'addr:77 specimen ln|san diego'))
  ), null) ->> 'listing_id')::uuid;

  -- Statuses, verification and promotion (with history) -------------------------
  update public.h4a_listings
  set status = 'dismissed', dismissed_reason = 'Price too high (demo)', dismissed_at = now() - interval '4 days'
  where id = l_specimen;
  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, summary, changes)
  values (ws, l_specimen, 'status', 'demo', 'Dismissed — Price too high (demo)',
    jsonb_build_object('status', jsonb_build_object('from', 'new', 'to', 'dismissed')));

  update public.h4a_listings
  set verification_status = 'verified',
      verification_note = 'Demo: units and year built match a fictional assessor record.',
      verification_source = 'Demo data — no real record was checked',
      verified_at = now() - interval '1 day'
  where id = l_example;
  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, summary, changes)
  values (ws, l_example, 'verification', 'demo', 'Marked verified — Demo data — no real record was checked',
    jsonb_build_object('verification', jsonb_build_object('from', 'unverified', 'to', 'verified')));

  update public.h4a_listings
  set verification_status = 'mismatch',
      verification_note = 'Demo: the fictional record shows 34 units; the listing says 36.',
      verification_source = 'Demo data — no real record was checked',
      verified_at = now() - interval '2 days'
  where id = l_ridge;
  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, summary, changes)
  values (ws, l_ridge, 'verification', 'demo', 'Marked mismatch — Demo data — no real record was checked',
    jsonb_build_object('verification', jsonb_build_object('from', 'unverified', 'to', 'mismatch')));

  -- The Phase 1 demo already has "Sample Ave Apartments" and its deal: link them.
  select id into v_prop from public.properties where workspace_id = ws and address = '3100 Sample Ave' limit 1;
  select id into v_deal from public.deals where workspace_id = ws and title = 'Sample Ave 24-unit acquisition' limit 1;
  if v_prop is not null and v_deal is not null then
    update public.h4a_listings
    set status = 'promoted', property_id = v_prop, deal_id = v_deal, promoted_at = now() - interval '1 day'
    where id = l_sample;
    insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, summary, changes)
    values (ws, l_sample, 'promoted', 'demo', 'Promoted to a deal in New Deal (linked to an existing property)',
      jsonb_build_object('status', jsonb_build_object('from', 'new', 'to', 'promoted'),
        'deal_id', v_deal, 'property_id', v_prop, 'property_created', false));
  end if;

  -- In-app alerts (scores match src/features/h4a/scoring/score.ts for the sample buy box).
  insert into public.h4a_alerts (workspace_id, listing_id, score, threshold, reason, created_at, read_at)
  values
    (ws, l_sample, 100, 70, 'new_listing', now() - interval '2 days', now() - interval '1 day'),
    (ws, l_example, 100, 70, 'new_listing', now() - interval '2 days', null),
    (ws, l_fictional, 80, 70, 'new_listing', now() - interval '1 day', null),
    (ws, l_placeholder, 70, 70, 'new_listing', now() - interval '20 hours', null)
  on conflict (workspace_id, listing_id) do nothing;
end;
$$;
