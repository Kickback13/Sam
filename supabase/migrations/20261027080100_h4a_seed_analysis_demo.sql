-- =============================================================================
-- Housing4All Track (Phase 3A): deal-analysis sample data — Demo workspace ONLY.
--
-- Touches only the workspace with slug 'demo' and is_demo = true, and only its
-- fictional "3100 Sample Ave" property (seeded by *_h4a_seed_demo.sql). Does
-- nothing if either is missing, or if the Demo workspace already has a scenario
-- (idempotent). Everything is fictional and labeled "Demo data".
--
-- Price and units keep the sources they already have (the demo listing and the
-- property); every other input is labeled "Demo data".
-- =============================================================================

do $$
declare
  ws uuid;
  prop uuid;
  listing_price_source jsonb;
  units_source jsonb;
  demo_source jsonb := jsonb_build_object(
    'source', 'demo', 'label', 'Demo data', 'url', null, 'fetched_at', now()::text);
  price numeric;
  units integer;
begin
  select id into ws from public.workspaces where slug = 'demo' and is_demo;
  if ws is null then
    return;
  end if;
  if exists (select 1 from public.h4a_underwriting where workspace_id = ws) then
    return;
  end if;
  select p.id, p.units, p.field_sources -> 'units'
    into prop, units, units_source
  from public.properties p
  where p.workspace_id = ws and p.address = '3100 Sample Ave' and p.deleted_at is null
  limit 1;
  if prop is null then
    return;
  end if;
  select l.price, l.field_sources -> 'price' into price, listing_price_source
  from public.h4a_listings l
  where l.workspace_id = ws and l.property_id = prop
  order by l.promoted_at desc nulls last
  limit 1;

  insert into public.h4a_underwriting (workspace_id, property_id, name, inputs, input_sources, notes, created_by, updated_by)
  values (
    ws, prop, 'Asking price (demo)',
    jsonb_build_object(
      'price', price, 'units', units, 'buildingSqft', null,
      'unitMix', jsonb_build_array(
        jsonb_build_object('label', '1BR/1BA', 'count', 12, 'monthlyRent', 1950),
        jsonb_build_object('label', '2BR/1BA', 'count', 12, 'monthlyRent', 2450)),
      'monthlyRentTotal', null, 'otherIncomeMonthly', null, 'vacancyPct', 5,
      'expenseMode', 'itemized', 'taxRatePct', 1.18, 'insurance', 24000, 'utilities', 38000,
      'repairs', 30000, 'managementPct', 4, 'payroll', null, 'otherExpenses', 9000,
      'expenseRatioPct', null, 'ltvPct', 60, 'interestRatePct', 6.5, 'amortYears', 30,
      'closingCosts', 75000),
    jsonb_strip_nulls(jsonb_build_object(
      'price', listing_price_source,
      'units', units_source,
      'unitMix', demo_source, 'vacancyPct', demo_source, 'taxRatePct', demo_source,
      'insurance', demo_source, 'utilities', demo_source, 'repairs', demo_source,
      'managementPct', demo_source, 'otherExpenses', demo_source, 'ltvPct', demo_source,
      'interestRatePct', demo_source, 'amortYears', demo_source, 'closingCosts', demo_source)),
    'Demo scenario: fictional rents and expenses to show how the analysis works.',
    null, null
  );

  insert into public.h4a_comps
    (workspace_id, property_id, kind, address, city, zip, units, price, sale_date, cap_rate,
     unit_type, monthly_rent, source_label, as_of, created_by)
  values
    (ws, prop, 'sale', '2900 Sample Ave', 'San Diego', '92104', 20, 3900000, current_date - 120, 5.6, null, null, 'Demo data (fictional)', current_date - 30, null),
    (ws, prop, 'sale', '410 Example Way', 'San Diego', '92104', 30, 6150000, current_date - 200, 5.4, null, null, 'Demo data (fictional)', current_date - 30, null),
    (ws, prop, 'sale', '77 Placeholder Ct', 'San Diego', '92116', 18, 3690000, current_date - 260, null, null, null, 'Demo data (fictional)', current_date - 30, null),
    (ws, prop, 'rent', '2950 Sample Ave', 'San Diego', '92104', null, null, null, null, '2BR/1BA', 2400, 'Demo data (fictional)', current_date - 14, null),
    (ws, prop, 'rent', '415 Example Way', 'San Diego', '92104', null, null, null, null, '1BR/1BA', 1925, 'Demo data (fictional)', current_date - 14, null);
end;
$$;
