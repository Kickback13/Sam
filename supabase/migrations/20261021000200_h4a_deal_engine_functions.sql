-- =============================================================================
-- Housing4All Track (Phase 2A): Deal Engine functions.
--
-- Listings, events, emails and alerts are written ONLY here, so every change is
-- recorded in h4a_listing_events and field sources can't be skipped.
--
--  Signed-in users (authenticated)               Forwarded email (anon + address token)
--  ------------------------------------------    ---------------------------------------
--  h4a_ingest_listings     manual / CSV / paste   h4a_inbound_receive      store email metadata
--  h4a_save_scores         scores + alerts        h4a_inbound_update_email body + parse result
--  h4a_create_email        "Paste an email"       h4a_inbound_ingest       listings from that email
--  h4a_update_email        parse result           h4a_inbound_save_scores  scores + alerts
--  h4a_set_listing_status  dismiss / restore / …  h4a_inbound_set_alert_email_status
--  h4a_verify_listing      verified / mismatch
--  h4a_promote_listing     property + deal
--  h4a_mark_alerts_read    alerts
--  h4a_set_alert_email_status
--
-- Every function is SECURITY DEFINER with search_path = '' and checks access
-- itself: membership/role via app_private.*_workspace_ids(), or — for the inbound
-- email path, which has no user session and no service-role key — possession of
-- the workspace's forwarding-address token (only its SHA-256 is stored).
-- Scoring math lives in TypeScript (src/features/h4a/scoring/score.ts); the
-- database stores the score with the buy-box version it was computed against.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Small helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function app_private.h4a_require_writer(p_ws uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ws is null or not exists (select 1 from app_private.writer_workspace_ids() w where w = p_ws) then
    raise exception 'You don''t have permission to do that in this workspace' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.h4a_require_admin(p_ws uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ws is null or not exists (select 1 from app_private.admin_workspace_ids() w where w = p_ws) then
    raise exception 'Only owners and admins can do that' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.h4a_require_member(p_ws uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ws is null or not exists (select 1 from app_private.member_workspace_ids() w where w = p_ws) then
    raise exception 'You don''t have access to this workspace' using errcode = '42501';
  end if;
end;
$$;

-- Workspace for a forwarding-address token (NULL when unknown).
create or replace function app_private.h4a_token_workspace(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.workspace_id
  from public.h4a_inbound_addresses a
  where p_token is not null
    and char_length(btrim(p_token)) between 16 and 64
    and a.token_hash = encode(extensions.digest(lower(btrim(p_token)), 'sha256'), 'hex');
$$;

create or replace function app_private.h4a_require_token(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_token_workspace(p_token);
begin
  if v_ws is null then
    raise exception 'Unknown inbound address' using errcode = '42501';
  end if;
  return v_ws;
end;
$$;

create or replace function app_private.h4a_try_timestamptz(p text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(btrim(p), '')::timestamptz;
exception when others then
  return null;
end;
$$;

-- Manual entries and county records outrank alert emails, CSV rows and pasted emails:
-- a lower-ranked source never overwrites a higher-ranked value (it's logged as "kept").
create or replace function app_private.h4a_source_rank(p_source text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_source when 'manual' then 3 when 'county' then 3 else 1 end;
$$;

create or replace function app_private.h4a_buy_box_json(p_ws uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(b) - 'updated_by' - 'created_at' - 'updated_at' - 'notes'
     from public.h4a_buy_boxes b where b.workspace_id = p_ws),
    jsonb_build_object('version', 0, 'alert_threshold', 70)
  );
$$;

-- The listing fields the scoring module needs (after a merge).
create or replace function app_private.h4a_scoring_snapshot(p_ws uuid, p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'status', l.status, 'zip', l.zip, 'city', l.city, 'submarket', l.submarket,
    'property_type', l.property_type, 'units', l.units, 'price', l.price,
    'price_per_unit', l.price_per_unit, 'year_built', l.year_built
  )
  from public.h4a_listings l
  where l.workspace_id = p_ws and l.id = p_listing_id;
$$;

-- ---------------------------------------------------------------------------
-- Ingest one listing: dedupe (APN, then overlapping address keys), insert or
-- merge field by field, record the event. Returns {listing_id, action, changed}.
--
-- p_item = {
--   origin:  'email' | 'csv' | 'manual' | 'paste' | 'county' | 'demo',
--   source:  { label, url?, fetched_at? },           -- one source for every field given
--   fields:  { address, city, state, zip, apn, property_type, price, units, cap_rate,
--              year_built, building_sqft, lot_sqft, submarket, broker_name,
--              broker_company, broker_phone, broker_email, listing_url },
--   keys:    { street_key, apn_key, match_keys[] },  -- from src/features/h4a/listing/normalize.ts
--   review:  { needs_review, reasons[], confidence },
--   listing_id?: uuid                                 -- update this listing (manual edit)
-- }
-- ---------------------------------------------------------------------------
create or replace function app_private.h4a_ingest_one(p_ws uuid, p_actor uuid, p_item jsonb, p_email_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text := p_item ->> 'origin';
  v_fields jsonb := coalesce(p_item -> 'fields', '{}'::jsonb);
  v_keys jsonb := coalesce(p_item -> 'keys', '{}'::jsonb);
  v_review jsonb := coalesce(p_item -> 'review', '{}'::jsonb);
  v_street_key text := nullif(btrim(v_keys ->> 'street_key'), '');
  v_apn_key text := nullif(btrim(v_keys ->> 'apn_key'), '');
  v_target uuid;
  v_match_keys text[];
  v_label text;
  v_url text;
  v_fetched timestamptz;
  v_source jsonb;
  v_now timestamptz := now();
  v_all text[] := array[
    'address', 'city', 'state', 'zip', 'apn', 'property_type', 'price', 'units', 'cap_rate',
    'year_built', 'building_sqft', 'lot_sqft', 'submarket', 'broker_name', 'broker_company',
    'broker_phone', 'broker_email', 'listing_url'
  ];
  v_numeric text[] := array['price', 'units', 'cap_rate', 'year_built', 'building_sqft', 'lot_sqft'];
  v_identity text[] := array['address', 'city', 'state', 'zip', 'apn'];
  v_clean jsonb := '{}'::jsonb;
  l public.h4a_listings;
  v_old jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_kept jsonb := '{}'::jsonb;
  v_sources jsonb;
  v_needs_review boolean := coalesce((v_review ->> 'needs_review')::boolean, false);
  v_reasons text[];
  v_confidence text := v_review ->> 'confidence';
  v_rank_new integer;
  v_rank_cur integer;
  v_cur text;
  v_new text;
  v_same boolean;
  v_is_changed boolean;
  f text;
begin
  if v_origin is null or v_origin not in ('email', 'csv', 'manual', 'paste', 'county', 'demo') then
    raise exception 'Unknown listing origin' using errcode = '22023';
  end if;
  if jsonb_typeof(v_fields) <> 'object' then
    raise exception 'Listing fields must be an object' using errcode = '22023';
  end if;
  if v_confidence is not null and v_confidence not in ('high', 'medium', 'low') then
    v_confidence := null;
  end if;
  begin
    v_target := nullif(p_item ->> 'listing_id', '')::uuid;
  exception when others then
    raise exception 'Invalid listing id' using errcode = '22023';
  end;

  -- Clean values: trimmed text, blanks dropped, numbers validated.
  foreach f in array v_all loop
    v_new := nullif(btrim(v_fields ->> f), '');
    continue when v_new is null;
    if f = any (v_numeric) then
      begin
        perform v_new::numeric;
      exception when others then
        raise exception '% must be a number', replace(f, '_', ' ') using errcode = '22023';
      end;
    end if;
    v_clean := v_clean || jsonb_build_object(f, v_new);
  end loop;

  -- Source for every field this item provides. Manual entries are always
  -- "Entered by <the signed-in user>" (the label isn't taken from the caller).
  if v_origin = 'manual' then
    v_label := 'Entered by ' || coalesce(
      (select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email::text, '@', 1))
       from public.profiles p where p.id = p_actor),
      'a teammate');
  else
    v_label := left(nullif(btrim(p_item -> 'source' ->> 'label'), ''), 120);
  end if;
  if v_label is null then
    raise exception 'A source label is required' using errcode = '22023';
  end if;
  v_url := nullif(btrim(p_item -> 'source' ->> 'url'), '');
  if v_url is not null and (v_url !~* '^https?://' or char_length(v_url) > 2048) then
    v_url := null;
  end if;
  v_fetched := least(coalesce(app_private.h4a_try_timestamptz(p_item -> 'source' ->> 'fetched_at'), v_now), v_now);
  v_source := jsonb_build_object(
    'source', case when v_origin = 'paste' then 'email' else v_origin end,
    'label', v_label,
    'url', v_url,
    'fetched_at', v_fetched,
    'user_id', case when v_origin = 'manual' then p_actor end
  );

  select coalesce(array_agg(distinct k order by k), '{}') into v_match_keys
  from (
    select left(k, 320) as k
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_keys -> 'match_keys') = 'array' then v_keys -> 'match_keys' else '[]'::jsonb end
    ) k
    where k ~ '^(apn|addr):.+'
    limit 10
  ) s;
  if v_apn_key is not null and v_apn_key !~ '^[0-9]{6,20}$' then
    v_apn_key := null;
  end if;

  -- Find the listing this item belongs to.
  if v_target is not null then
    select * into l from public.h4a_listings x
    where x.workspace_id = p_ws and x.id = v_target
    for update;
    if l.id is null then
      raise exception 'Listing not found' using errcode = 'P0002';
    end if;
  else
    if v_street_key is null and v_apn_key is null then
      raise exception 'A street address is required' using errcode = '22023';
    end if;
    select * into l from public.h4a_listings x
    where x.workspace_id = p_ws
      and (
        (v_apn_key is not null and x.apn_key = v_apn_key)
        or (
          x.match_keys && v_match_keys
          and not (x.apn_key is not null and v_apn_key is not null and x.apn_key <> v_apn_key)
        )
      )
    order by (v_apn_key is not null and x.apn_key = v_apn_key) desc, x.received_at
    limit 1
    for update;
  end if;

  -- New listing --------------------------------------------------------------
  if l.id is null then
    if v_clean ->> 'address' is null or v_street_key is null then
      raise exception 'A street address is required' using errcode = '22023';
    end if;
    select coalesce(array_agg(left(r, 200)), '{}') into v_reasons
    from (
      select r from jsonb_array_elements_text(
        case when jsonb_typeof(v_review -> 'reasons') = 'array' then v_review -> 'reasons' else '[]'::jsonb end
      ) r limit 20
    ) s;
    select coalesce(jsonb_object_agg(k, v_source), '{}'::jsonb) into v_sources
    from jsonb_object_keys(v_clean) k;

    insert into public.h4a_listings (
      workspace_id, status, origin, source_label, address, city, state, zip, apn,
      street_key, apn_key, match_keys, property_type, price, units, cap_rate, year_built,
      building_sqft, lot_sqft, submarket, broker_name, broker_company, broker_phone,
      broker_email, listing_url, received_at, last_received_at, field_sources,
      review_reasons, parse_confidence, created_by
    )
    values (
      p_ws,
      case when v_needs_review then 'needs_review' else 'new' end,
      v_origin, v_label,
      v_clean ->> 'address', v_clean ->> 'city', coalesce(v_clean ->> 'state', 'CA'),
      v_clean ->> 'zip', v_clean ->> 'apn',
      v_street_key, v_apn_key, v_match_keys,
      v_clean ->> 'property_type',
      (v_clean ->> 'price')::numeric, (v_clean ->> 'units')::integer, (v_clean ->> 'cap_rate')::numeric,
      (v_clean ->> 'year_built')::integer, (v_clean ->> 'building_sqft')::integer,
      (v_clean ->> 'lot_sqft')::integer, v_clean ->> 'submarket',
      v_clean ->> 'broker_name', v_clean ->> 'broker_company', v_clean ->> 'broker_phone',
      v_clean ->> 'broker_email', v_clean ->> 'listing_url',
      v_fetched, v_fetched, v_sources, v_reasons, v_confidence, p_actor
    )
    returning * into l;

    insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, source_label, email_id, actor_id, summary, changes)
    values (
      p_ws, l.id, 'created', v_origin, v_label, p_email_id, p_actor,
      'Added from ' || v_label,
      jsonb_build_object('changed', (
        select coalesce(jsonb_object_agg(k, jsonb_build_object('from', null, 'to', v_clean -> k)), '{}'::jsonb)
        from jsonb_object_keys(v_clean) k
      ))
        || case when cardinality(v_reasons) > 0 then jsonb_build_object('review_reasons', to_jsonb(v_reasons)) else '{}'::jsonb end
    );

    return jsonb_build_object('listing_id', l.id, 'action', 'created', 'changed', true);
  end if;

  -- Existing listing: merge field by field ---------------------------------------
  v_old := to_jsonb(l);
  v_sources := l.field_sources;
  v_rank_new := app_private.h4a_source_rank(v_source ->> 'source');

  foreach f in array v_all loop
    v_new := v_clean ->> f;
    continue when v_new is null;
    v_cur := nullif(v_old ->> f, '');
    v_rank_cur := app_private.h4a_source_rank(l.field_sources -> f ->> 'source');

    if f = any (v_numeric) then
      v_same := v_cur is not null and v_cur::numeric = v_new::numeric;
    elsif f = 'address' then
      v_same := v_cur is not null and (lower(v_cur) = lower(v_new) or v_street_key = l.street_key);
    elsif f = 'zip' then
      v_same := v_cur is not null and left(v_cur, 5) = left(v_new, 5);
    else
      v_same := v_cur is not null and lower(v_cur) = lower(v_new);
    end if;

    if v_same then
      -- Seen again: refresh the source when this one ranks the same or higher.
      if v_rank_new >= v_rank_cur then
        v_sources := jsonb_set(v_sources, array[f], v_source);
      end if;
      continue;
    end if;

    if v_cur is null then
      v_patch := v_patch || jsonb_build_object(f, v_new);
      v_sources := jsonb_set(v_sources, array[f], v_source);
      v_changed := v_changed || jsonb_build_object(f, jsonb_build_object('from', null, 'to', v_new));
    elsif v_rank_new < v_rank_cur
       or (f = any (v_identity) and v_origin not in ('manual', 'county')) then
      v_kept := v_kept || jsonb_build_object(f, jsonb_build_object(
        'kept', v_cur, 'offered', v_new, 'kept_source', l.field_sources -> f ->> 'label'));
    else
      v_patch := v_patch || jsonb_build_object(f, v_new);
      v_sources := jsonb_set(v_sources, array[f], v_source);
      v_changed := v_changed || jsonb_build_object(f, jsonb_build_object('from', v_cur, 'to', v_new));
    end if;
  end loop;

  v_is_changed := v_changed <> '{}'::jsonb;

  update public.h4a_listings x set
    address = case when v_patch ? 'address' then v_patch ->> 'address' else x.address end,
    street_key = case when v_patch ? 'address' and v_street_key is not null then v_street_key else x.street_key end,
    city = case when v_patch ? 'city' then v_patch ->> 'city' else x.city end,
    state = case when v_patch ? 'state' then v_patch ->> 'state' else x.state end,
    zip = case when v_patch ? 'zip' then v_patch ->> 'zip' else x.zip end,
    apn = case when v_patch ? 'apn' then v_patch ->> 'apn' else x.apn end,
    apn_key = case when v_patch ? 'apn' then coalesce(v_apn_key, x.apn_key) else coalesce(x.apn_key, v_apn_key) end,
    match_keys = (
      select coalesce(array_agg(k order by k), '{}')
      from (select distinct k from unnest(x.match_keys || v_match_keys) k limit 20) s
    ),
    property_type = case when v_patch ? 'property_type' then v_patch ->> 'property_type' else x.property_type end,
    price = case when v_patch ? 'price' then (v_patch ->> 'price')::numeric else x.price end,
    units = case when v_patch ? 'units' then (v_patch ->> 'units')::integer else x.units end,
    cap_rate = case when v_patch ? 'cap_rate' then (v_patch ->> 'cap_rate')::numeric else x.cap_rate end,
    year_built = case when v_patch ? 'year_built' then (v_patch ->> 'year_built')::integer else x.year_built end,
    building_sqft = case when v_patch ? 'building_sqft' then (v_patch ->> 'building_sqft')::integer else x.building_sqft end,
    lot_sqft = case when v_patch ? 'lot_sqft' then (v_patch ->> 'lot_sqft')::integer else x.lot_sqft end,
    submarket = case when v_patch ? 'submarket' then v_patch ->> 'submarket' else x.submarket end,
    broker_name = case when v_patch ? 'broker_name' then v_patch ->> 'broker_name' else x.broker_name end,
    broker_company = case when v_patch ? 'broker_company' then v_patch ->> 'broker_company' else x.broker_company end,
    broker_phone = case when v_patch ? 'broker_phone' then v_patch ->> 'broker_phone' else x.broker_phone end,
    broker_email = case when v_patch ? 'broker_email' then v_patch ->> 'broker_email' else x.broker_email end,
    listing_url = case when v_patch ? 'listing_url' then v_patch ->> 'listing_url' else x.listing_url end,
    field_sources = v_sources,
    last_received_at = case
      when v_origin in ('email', 'csv', 'paste') then greatest(x.last_received_at, v_fetched)
      else x.last_received_at
    end
  where x.id = l.id;

  -- A manual edit that changes nothing leaves no history entry.
  if v_is_changed or v_kept <> '{}'::jsonb or v_origin <> 'manual' then
    insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, source_label, email_id, actor_id, summary, changes)
    values (
      p_ws, l.id,
      case when v_is_changed then 'updated' else 'repeat' end,
      v_origin, v_label, p_email_id, p_actor,
      case when v_is_changed then 'Updated from ' || v_label else 'Seen again in ' || v_label end,
      jsonb_strip_nulls(jsonb_build_object(
        'changed', nullif(v_changed, '{}'::jsonb),
        'kept', nullif(v_kept, '{}'::jsonb)
      ))
    );
  end if;

  return jsonb_build_object(
    'listing_id', l.id,
    'action', case when v_is_changed then 'updated' else 'unchanged' end,
    'changed', v_is_changed,
    'kept', v_kept
  );
end;
$$;

-- Batch ingest (one transaction; ingestion is serialized per workspace so two
-- copies of the same alert can never create duplicates). A bad item is reported
-- in its result and doesn't stop the batch.
create or replace function app_private.h4a_ingest_batch(
  p_ws uuid, p_actor uuid, p_items jsonb, p_email_id uuid, p_allowed_origins text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_res jsonb;
  v_results jsonb := '[]'::jsonb;
  v_index integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Send between 0 and 500 listings at a time' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('h4a_ingest:' || p_ws::text, 0));

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      if jsonb_typeof(v_item) <> 'object' or not ((v_item ->> 'origin') = any (p_allowed_origins)) then
        raise exception 'That source isn''t allowed here' using errcode = '42501';
      end if;
      v_res := app_private.h4a_ingest_one(p_ws, p_actor, v_item, p_email_id);
      v_res := v_res || jsonb_build_object(
        'index', v_index,
        'snapshot', app_private.h4a_scoring_snapshot(p_ws, (v_res ->> 'listing_id')::uuid)
      );
    exception when others then
      v_res := jsonb_build_object('index', v_index, 'action', 'error', 'code', sqlstate, 'error', left(sqlerrm, 300));
    end;
    v_results := v_results || jsonb_build_array(v_res);
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('results', v_results, 'buy_box', app_private.h4a_buy_box_json(p_ws));
end;
$$;

-- Store scores computed by src/features/h4a/scoring/score.ts. A score computed
-- against an older buy-box version is ignored (counted as stale). Listings in
-- p_alertable (new or updated by this ingest) that reach the threshold get one
-- in-app alert each — ever.
create or replace function app_private.h4a_save_scores(
  p_ws uuid, p_scores jsonb, p_alertable uuid[], p_email_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_threshold integer;
  s jsonb;
  v_id uuid;
  v_score integer;
  v_status text;
  v_saved integer := 0;
  v_stale integer := 0;
  v_alert_id uuid;
  v_alerts jsonb := '[]'::jsonb;
  v_reason text;
  v_email_status text := coalesce(p_email_status, 'not_connected');
begin
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) > 1000 then
    raise exception 'Send between 0 and 1000 scores at a time' using errcode = '22023';
  end if;
  if v_email_status not in ('not_connected', 'off', 'queued') then
    raise exception 'Invalid alert email status' using errcode = '22023';
  end if;
  select b.version, b.alert_threshold into v_version, v_threshold
  from public.h4a_buy_boxes b where b.workspace_id = p_ws;
  v_version := coalesce(v_version, 0);
  v_threshold := coalesce(v_threshold, 70);

  for s in select value from jsonb_array_elements(p_scores) loop
    begin
      v_id := (s ->> 'listing_id')::uuid;
      v_score := (s ->> 'score')::integer;
    exception when others then
      raise exception 'Invalid score entry' using errcode = '22023';
    end;
    if coalesce((s ->> 'buy_box_version')::integer, -1) <> v_version then
      v_stale := v_stale + 1;
      continue;
    end if;
    if v_score is not null and (v_score < 0 or v_score > 100) then
      raise exception 'Scores run from 0 to 100' using errcode = '22023';
    end if;
    if jsonb_typeof(coalesce(s -> 'breakdown', '[]'::jsonb)) <> 'array' then
      raise exception 'Score breakdown must be a list' using errcode = '22023';
    end if;

    v_status := null;
    update public.h4a_listings l set
      score = v_score,
      score_breakdown = coalesce(s -> 'breakdown', '[]'::jsonb),
      scored_at = now(),
      scored_buy_box_version = v_version
    where l.workspace_id = p_ws and l.id = v_id
    returning l.status into v_status;
    continue when v_status is null;
    v_saved := v_saved + 1;

    if v_score is not null and v_score >= v_threshold
       and v_id = any (coalesce(p_alertable, '{}'))
       and v_status not in ('dismissed', 'promoted') then
      v_reason := case
        when exists (
          select 1 from public.h4a_listing_events e
          where e.listing_id = v_id and e.kind = 'created' and e.created_at > now() - interval '1 day'
        ) then 'new_listing'
        else 'updated_listing'
      end;
      v_alert_id := null;
      insert into public.h4a_alerts (workspace_id, listing_id, score, threshold, reason, email_status)
      values (p_ws, v_id, v_score, v_threshold, v_reason, v_email_status)
      on conflict (workspace_id, listing_id) do nothing
      returning id into v_alert_id;
      if v_alert_id is not null then
        v_alerts := v_alerts || jsonb_build_array((
          select jsonb_build_object(
            'alert_id', v_alert_id, 'listing_id', l.id, 'score', v_score, 'threshold', v_threshold,
            'address', l.address, 'city', l.city, 'zip', l.zip, 'price', l.price, 'units', l.units,
            'source_label', l.source_label,
            'notify_email', (select w.owner_email from public.workspaces w where w.id = p_ws)
          )
          from public.h4a_listings l where l.id = v_id
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object('saved', v_saved, 'stale', v_stale, 'version', v_version, 'alerts', v_alerts);
end;
$$;

create or replace function app_private.h4a_update_email(p_ws uuid, p_email_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid email update' using errcode = '22023';
  end if;
  update public.h4a_inbound_emails e set
    text_body = case when p_patch ? 'text_body' then p_patch ->> 'text_body' else e.text_body end,
    html_body = case when p_patch ? 'html_body' then p_patch ->> 'html_body' else e.html_body end,
    body_status = case when p_patch ? 'body_status' then p_patch ->> 'body_status' else e.body_status end,
    parse_status = case when p_patch ? 'parse_status' then p_patch ->> 'parse_status' else e.parse_status end,
    parser_key = case when p_patch ? 'parser_key' then left(p_patch ->> 'parser_key', 60) else e.parser_key end,
    parser_label = case when p_patch ? 'parser_label' then left(p_patch ->> 'parser_label', 120) else e.parser_label end,
    confidence = case when p_patch ? 'confidence' then p_patch ->> 'confidence' else e.confidence end,
    listing_count = case when p_patch ? 'listing_count' then (p_patch ->> 'listing_count')::integer else e.listing_count end,
    parse_notes = case
      when jsonb_typeof(p_patch -> 'parse_notes') = 'array' then p_patch -> 'parse_notes'
      else e.parse_notes
    end,
    error = case when p_patch ? 'error' then left(p_patch ->> 'error', 2000) else e.error end,
    attempts = e.attempts + case when coalesce((p_patch ->> 'attempt')::boolean, false) then 1 else 0 end
  where e.workspace_id = p_ws and e.id = p_email_id;
  if not found then
    raise exception 'Email not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function app_private.h4a_set_alert_email(
  p_ws uuid, p_alert_id uuid, p_status text, p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('not_connected', 'off', 'queued', 'sent', 'failed') then
    raise exception 'Invalid alert email status' using errcode = '22023';
  end if;
  update public.h4a_alerts a set
    email_status = p_status,
    email_error = left(p_error, 1000),
    email_sent_at = case when p_status = 'sent' then now() else a.email_sent_at end
  where a.workspace_id = p_ws and a.id = p_alert_id;
  if not found then
    raise exception 'Alert not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function app_private.h4a_require_writer(uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_require_admin(uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_require_member(uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_token_workspace(text) from public, anon, authenticated;
revoke all on function app_private.h4a_require_token(text) from public, anon, authenticated;
revoke all on function app_private.h4a_try_timestamptz(text) from public, anon, authenticated;
revoke all on function app_private.h4a_source_rank(text) from public, anon, authenticated;
revoke all on function app_private.h4a_buy_box_json(uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_scoring_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_ingest_one(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function app_private.h4a_ingest_batch(uuid, uuid, jsonb, uuid, text[]) from public, anon, authenticated;
revoke all on function app_private.h4a_save_scores(uuid, jsonb, uuid[], text) from public, anon, authenticated;
revoke all on function app_private.h4a_update_email(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.h4a_set_alert_email(uuid, uuid, text, text) from public, anon, authenticated;

-- ===========================================================================
-- Signed-in users (authenticated)
-- ===========================================================================
create or replace function public.h4a_ingest_listings(p_workspace_id uuid, p_items jsonb, p_email_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  if p_email_id is not null and not exists (
    select 1 from public.h4a_inbound_emails e where e.id = p_email_id and e.workspace_id = p_workspace_id
  ) then
    raise exception 'That email isn''t in this workspace' using errcode = '23503';
  end if;
  return app_private.h4a_ingest_batch(p_workspace_id, auth.uid(), p_items, p_email_id, array['manual', 'csv', 'paste']);
end;
$$;

create or replace function public.h4a_save_scores(
  p_workspace_id uuid, p_scores jsonb, p_alertable uuid[] default '{}', p_email_status text default 'not_connected'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  return app_private.h4a_save_scores(p_workspace_id, p_scores, p_alertable, p_email_status);
end;
$$;

-- "Paste an email" (owners/admins): store the pasted email, then ingest with p_email_id.
create or replace function public.h4a_create_email(p_workspace_id uuid, p_email jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app_private.h4a_require_admin(p_workspace_id);
  if jsonb_typeof(p_email) <> 'object' or nullif(btrim(p_email ->> 'text_body'), '') is null then
    raise exception 'Paste the email text first' using errcode = '22023';
  end if;
  insert into public.h4a_inbound_emails (
    workspace_id, channel, from_address, subject, received_at, text_body, html_body, body_status, created_by
  )
  values (
    p_workspace_id, 'paste',
    left(nullif(btrim(p_email ->> 'from'), ''), 500),
    left(nullif(btrim(p_email ->> 'subject'), ''), 998),
    now(),
    p_email ->> 'text_body',
    nullif(p_email ->> 'html_body', ''),
    'stored',
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.h4a_update_email(p_workspace_id uuid, p_email_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  perform app_private.h4a_update_email(p_workspace_id, p_email_id, p_patch);
end;
$$;

-- dismiss (reason required) · restore · mark_reviewed · needs_review
create or replace function public.h4a_set_listing_status(
  p_workspace_id uuid, p_listing_id uuid, p_action text, p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.h4a_listings;
  v_reason text := left(nullif(btrim(p_reason), ''), 500);
  v_to text;
  v_summary text;
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  select * into l from public.h4a_listings x
  where x.workspace_id = p_workspace_id and x.id = p_listing_id
  for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if p_action = 'dismiss' then
    if l.status = 'promoted' then
      raise exception 'Promoted listings can''t be dismissed' using errcode = '22023';
    end if;
    if v_reason is null then
      raise exception 'Add a reason for dismissing this listing' using errcode = '22023';
    end if;
    v_to := 'dismissed';
    v_summary := 'Dismissed — ' || v_reason;
    update public.h4a_listings set status = v_to, dismissed_reason = v_reason,
      dismissed_at = now(), dismissed_by = auth.uid()
    where id = l.id;
  elsif p_action = 'restore' then
    if l.status <> 'dismissed' then
      raise exception 'Only dismissed listings can be restored' using errcode = '22023';
    end if;
    v_to := 'new';
    v_summary := 'Restored to the inbox';
    update public.h4a_listings set status = v_to, dismissed_reason = null, dismissed_at = null, dismissed_by = null
    where id = l.id;
  elsif p_action = 'mark_reviewed' then
    if l.status <> 'needs_review' then
      raise exception 'This listing isn''t waiting for review' using errcode = '22023';
    end if;
    v_to := 'new';
    v_summary := 'Reviewed — parsed fields confirmed';
    update public.h4a_listings set status = v_to, review_reasons = '{}' where id = l.id;
  elsif p_action = 'needs_review' then
    if l.status <> 'new' then
      raise exception 'Only new listings can be sent back for review' using errcode = '22023';
    end if;
    v_to := 'needs_review';
    v_summary := 'Sent back for review' || coalesce(' — ' || v_reason, '');
    update public.h4a_listings set status = v_to,
      review_reasons = case when v_reason is null then review_reasons else array_append(review_reasons, v_reason) end
    where id = l.id;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, actor_id, summary, changes)
  values (
    p_workspace_id, l.id, 'status', 'manual', auth.uid(), v_summary,
    jsonb_strip_nulls(jsonb_build_object('status', jsonb_build_object('from', l.status, 'to', v_to), 'reason', v_reason))
  );
  return v_to;
end;
$$;

-- Manual verification: verified / mismatch need a note and where it was checked.
create or replace function public.h4a_verify_listing(
  p_workspace_id uuid, p_listing_id uuid, p_status text, p_note text default null, p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.h4a_listings;
  v_note text := left(nullif(btrim(p_note), ''), 2000);
  v_source text := left(nullif(btrim(p_source), ''), 300);
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  if p_status is null or p_status not in ('verified', 'mismatch', 'unverified') then
    raise exception 'Unknown verification status' using errcode = '22023';
  end if;
  if p_status <> 'unverified' and (v_note is null or v_source is null) then
    raise exception 'Add a note and where you checked (for example, the SD County Assessor site)' using errcode = '22023';
  end if;
  select * into l from public.h4a_listings x
  where x.workspace_id = p_workspace_id and x.id = p_listing_id
  for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  update public.h4a_listings set
    verification_status = p_status,
    verification_note = case when p_status = 'unverified' then null else v_note end,
    verification_source = case when p_status = 'unverified' then null else v_source end,
    verified_at = case when p_status = 'unverified' then null else now() end,
    verified_by = case when p_status = 'unverified' then null else auth.uid() end
  where id = l.id;

  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, actor_id, summary, changes)
  values (
    p_workspace_id, l.id, 'verification', 'manual', auth.uid(),
    case p_status
      when 'verified' then 'Marked verified — ' || v_source
      when 'mismatch' then 'Marked mismatch — ' || v_source
      else 'Verification cleared'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'verification', jsonb_build_object('from', l.verification_status, 'to', p_status),
      'note', v_note, 'source', v_source
    ))
  );
end;
$$;

-- Promote: create or link the Property (copying fields with their sources),
-- create a Deal in New Deal on the Acquisitions pipeline, log activities, and
-- link the listing to both. Atomic. Idempotent once promoted.
create or replace function public.h4a_promote_listing(
  p_workspace_id uuid, p_listing_id uuid, p_property_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.h4a_listings;
  pr public.properties;
  v_pipe uuid;
  v_stage uuid;
  v_stage_name text;
  v_pos double precision;
  v_prop uuid;
  v_prop_created boolean := false;
  v_deal uuid;
  v_title text;
  v_body text;
  v_copy text[] := array['apn', 'property_type', 'units', 'year_built', 'building_sqft', 'lot_sqft'];
  v_listing jsonb;
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  select * into l from public.h4a_listings x
  where x.workspace_id = p_workspace_id and x.id = p_listing_id
  for update;
  if l.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if l.status = 'promoted' and l.deal_id is not null then
    return jsonb_build_object('property_id', l.property_id, 'deal_id', l.deal_id, 'already', true);
  end if;
  if l.status = 'dismissed' then
    raise exception 'Restore this listing before promoting it' using errcode = '22023';
  end if;

  select p.id into v_pipe
  from public.pipelines p
  where p.workspace_id = p_workspace_id and p.kind = 'acquisition'
  order by p.is_default desc, p.position, p.created_at
  limit 1;
  if v_pipe is null then
    raise exception 'This workspace has no Acquisitions pipeline' using errcode = '22023';
  end if;
  select s.id, s.name into v_stage, v_stage_name
  from public.pipeline_stages s
  where s.pipeline_id = v_pipe and not s.is_won and not s.is_lost
  order by (s.name = 'New Deal') desc, s.position
  limit 1;
  if v_stage is null then
    raise exception 'The Acquisitions pipeline has no open stage' using errcode = '22023';
  end if;

  v_listing := to_jsonb(l);
  v_prop := coalesce(p_property_id, l.property_id);
  if v_prop is not null then
    select * into pr from public.properties p
    where p.workspace_id = p_workspace_id and p.id = v_prop and p.deleted_at is null
    for update;
    if pr.id is null then
      raise exception 'That property isn''t in this workspace' using errcode = '23503';
    end if;
    -- Fill only empty property fields, carrying the listing's sources.
    update public.properties p set
      apn = coalesce(p.apn, l.apn),
      property_type = coalesce(p.property_type, l.property_type),
      units = coalesce(p.units, l.units),
      year_built = coalesce(p.year_built, l.year_built),
      building_sqft = coalesce(p.building_sqft, l.building_sqft),
      lot_sqft = coalesce(p.lot_sqft, l.lot_sqft),
      city = coalesce(p.city, l.city),
      zip = coalesce(p.zip, l.zip),
      submarket = coalesce(p.submarket, l.submarket),
      field_sources = p.field_sources || (
        select coalesce(jsonb_object_agg(k, l.field_sources -> k), '{}'::jsonb)
        from unnest(v_copy) k
        where l.field_sources ? k and v_listing ->> k is not null and to_jsonb(pr) ->> k is null
      )
    where p.id = pr.id;
  else
    insert into public.properties (
      workspace_id, address, city, state, zip, apn, property_type, units, building_sqft,
      lot_sqft, year_built, submarket, field_sources, tags, created_by
    )
    values (
      p_workspace_id, l.address, l.city, l.state, l.zip, l.apn, l.property_type, l.units,
      l.building_sqft, l.lot_sqft, l.year_built, l.submarket,
      (
        select coalesce(jsonb_object_agg(k, l.field_sources -> k), '{}'::jsonb)
        from unnest(v_copy) k
        where l.field_sources ? k and v_listing ->> k is not null
      ),
      array['deal-finder'], auth.uid()
    )
    returning id into v_prop;
    v_prop_created := true;
  end if;

  select coalesce(min(d.position) - 1000, 1000) into v_pos
  from public.deals d
  where d.workspace_id = p_workspace_id and d.stage_id = v_stage and d.deleted_at is null;

  v_title := left(l.address || coalesce(' — ' || l.units || ' units', ''), 200);
  insert into public.deals (
    workspace_id, pipeline_id, stage_id, title, property_id, value, asking_price, units,
    source, assigned_to, created_by, position, notes
  )
  values (
    p_workspace_id, v_pipe, v_stage, v_title, v_prop, l.price, l.price, l.units,
    left('Deal Finder · ' || l.source_label, 100), auth.uid(), auth.uid(), v_pos,
    'Promoted from Deal Finder.' || coalesce(' Original listing: ' || l.listing_url, '')
  )
  returning id into v_deal;

  v_body := 'Promoted from Deal Finder: ' || l.address
    || coalesce(' · score ' || l.score, '') || ' · ' || l.source_label
    || case l.verification_status when 'verified' then ' · verified' when 'mismatch' then ' · verification mismatch' else ' · unverified' end;
  insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
  values
    (p_workspace_id, 'system', 'deal', v_deal, v_body,
     jsonb_build_object('event', 'listing_promoted', 'listing_id', l.id, 'score', l.score), auth.uid()),
    (p_workspace_id, 'system', 'property', v_prop, v_body,
     jsonb_build_object('event', 'listing_promoted', 'listing_id', l.id, 'deal_id', v_deal), auth.uid());

  update public.h4a_listings set
    status = 'promoted', property_id = v_prop, deal_id = v_deal,
    promoted_at = now(), promoted_by = auth.uid()
  where id = l.id;

  insert into public.h4a_listing_events (workspace_id, listing_id, kind, origin, actor_id, summary, changes)
  values (
    p_workspace_id, l.id, 'promoted', 'manual', auth.uid(),
    'Promoted to a deal in ' || v_stage_name || case when v_prop_created then ' (new property)' else ' (linked to an existing property)' end,
    jsonb_build_object(
      'status', jsonb_build_object('from', l.status, 'to', 'promoted'),
      'deal_id', v_deal, 'property_id', v_prop, 'property_created', v_prop_created
    )
  );

  return jsonb_build_object(
    'property_id', v_prop, 'deal_id', v_deal, 'property_created', v_prop_created,
    'stage_name', v_stage_name, 'already', false
  );
end;
$$;

create or replace function public.h4a_mark_alerts_read(p_workspace_id uuid, p_alert_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform app_private.h4a_require_member(p_workspace_id);
  update public.h4a_alerts a set read_at = now(), read_by = auth.uid()
  where a.workspace_id = p_workspace_id
    and a.read_at is null
    and (p_alert_ids is null or a.id = any (p_alert_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.h4a_set_alert_email_status(
  p_workspace_id uuid, p_alert_id uuid, p_status text, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.h4a_require_writer(p_workspace_id);
  perform app_private.h4a_set_alert_email(p_workspace_id, p_alert_id, p_status, p_error);
end;
$$;

revoke all on function public.h4a_ingest_listings(uuid, jsonb, uuid) from public, anon;
revoke all on function public.h4a_save_scores(uuid, jsonb, uuid[], text) from public, anon;
revoke all on function public.h4a_create_email(uuid, jsonb) from public, anon;
revoke all on function public.h4a_update_email(uuid, uuid, jsonb) from public, anon;
revoke all on function public.h4a_set_listing_status(uuid, uuid, text, text) from public, anon;
revoke all on function public.h4a_verify_listing(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.h4a_promote_listing(uuid, uuid, uuid) from public, anon;
revoke all on function public.h4a_mark_alerts_read(uuid, uuid[]) from public, anon;
revoke all on function public.h4a_set_alert_email_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.h4a_ingest_listings(uuid, jsonb, uuid) to authenticated;
grant execute on function public.h4a_save_scores(uuid, jsonb, uuid[], text) to authenticated;
grant execute on function public.h4a_create_email(uuid, jsonb) to authenticated;
grant execute on function public.h4a_update_email(uuid, uuid, jsonb) to authenticated;
grant execute on function public.h4a_set_listing_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.h4a_verify_listing(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.h4a_promote_listing(uuid, uuid, uuid) to authenticated;
grant execute on function public.h4a_mark_alerts_read(uuid, uuid[]) to authenticated;
grant execute on function public.h4a_set_alert_email_status(uuid, uuid, text, text) to authenticated;

-- ===========================================================================
-- Forwarded email (no user session). Called by POST /api/inbound/email and the
-- Inngest function with the publishable key. The token is the random part of
-- the workspace's forwarding address — the same capability as being able to
-- send an email to it. It only ever reaches that one workspace, and only
-- through these functions. anon still has no table access at all.
-- ===========================================================================
create or replace function public.h4a_inbound_receive(p_token text, p_email jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_require_token(p_token);
  v_pid text := left(nullif(btrim(p_email ->> 'provider_email_id'), ''), 200);
  v_id uuid;
  v_status text;
  v_duplicate boolean := false;
begin
  if jsonb_typeof(p_email) <> 'object' or v_pid is null then
    raise exception 'Missing email id' using errcode = '22023';
  end if;
  if (
    select count(*) from public.h4a_inbound_emails e
    where e.workspace_id = v_ws and e.channel = 'resend' and e.created_at > now() - interval '1 hour'
  ) >= 500 then
    raise exception 'Too many emails for this address in the last hour' using errcode = 'PT429';
  end if;

  insert into public.h4a_inbound_emails (
    workspace_id, channel, provider_email_id, message_id, from_address, to_addresses, subject, received_at
  )
  values (
    v_ws, 'resend', v_pid,
    left(nullif(btrim(p_email ->> 'message_id'), ''), 998),
    left(nullif(btrim(p_email ->> 'from'), ''), 500),
    array(
      select left(x, 320) from jsonb_array_elements_text(
        case when jsonb_typeof(p_email -> 'to') = 'array' then p_email -> 'to' else '[]'::jsonb end
      ) x limit 50
    ),
    left(nullif(btrim(p_email ->> 'subject'), ''), 998),
    least(coalesce(app_private.h4a_try_timestamptz(p_email ->> 'received_at'), now()), now())
  )
  on conflict (workspace_id, provider_email_id) do nothing
  returning id, parse_status into v_id, v_status;

  if v_id is null then
    select e.id, e.parse_status into v_id, v_status
    from public.h4a_inbound_emails e
    where e.workspace_id = v_ws and e.provider_email_id = v_pid;
    v_duplicate := true;
  end if;
  return jsonb_build_object('email_id', v_id, 'workspace_id', v_ws, 'duplicate', v_duplicate, 'parse_status', v_status);
end;
$$;

create or replace function public.h4a_inbound_update_email(p_token text, p_email_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_require_token(p_token);
begin
  if not exists (
    select 1 from public.h4a_inbound_emails e
    where e.workspace_id = v_ws and e.id = p_email_id and e.channel = 'resend'
  ) then
    raise exception 'Email not found' using errcode = 'P0002';
  end if;
  perform app_private.h4a_update_email(v_ws, p_email_id, p_patch);
end;
$$;

create or replace function public.h4a_inbound_ingest(p_token text, p_email_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_require_token(p_token);
begin
  if not exists (
    select 1 from public.h4a_inbound_emails e
    where e.workspace_id = v_ws and e.id = p_email_id and e.channel = 'resend'
  ) then
    raise exception 'Email not found' using errcode = 'P0002';
  end if;
  return app_private.h4a_ingest_batch(v_ws, null, p_items, p_email_id, array['email']);
end;
$$;

-- Only listings this email touched in the last 6 hours can be scored (and alerted) this way.
create or replace function public.h4a_inbound_save_scores(
  p_token text, p_email_id uuid, p_scores jsonb, p_email_status text default 'not_connected'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_require_token(p_token);
  v_touched uuid[];
  v_alertable uuid[];
  v_scores jsonb;
begin
  if jsonb_typeof(p_scores) <> 'array' then
    raise exception 'Scores must be a list' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct e.listing_id), '{}'),
         coalesce(array_agg(distinct e.listing_id) filter (where e.kind in ('created', 'updated')), '{}')
    into v_touched, v_alertable
  from public.h4a_listing_events e
  where e.workspace_id = v_ws and e.email_id = p_email_id and e.created_at > now() - interval '6 hours';

  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_scores
  from jsonb_array_elements(p_scores) s
  where case
    when (s ->> 'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (s ->> 'listing_id')::uuid = any (v_touched)
    else false
  end;

  return app_private.h4a_save_scores(v_ws, v_scores, v_alertable, p_email_status);
end;
$$;

create or replace function public.h4a_inbound_set_alert_email_status(
  p_token text, p_alert_id uuid, p_status text, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := app_private.h4a_require_token(p_token);
begin
  perform app_private.h4a_set_alert_email(v_ws, p_alert_id, p_status, p_error);
end;
$$;

revoke all on function public.h4a_inbound_receive(text, jsonb) from public;
revoke all on function public.h4a_inbound_update_email(text, uuid, jsonb) from public;
revoke all on function public.h4a_inbound_ingest(text, uuid, jsonb) from public;
revoke all on function public.h4a_inbound_save_scores(text, uuid, jsonb, text) from public;
revoke all on function public.h4a_inbound_set_alert_email_status(text, uuid, text, text) from public;
grant execute on function public.h4a_inbound_receive(text, jsonb) to anon, authenticated;
grant execute on function public.h4a_inbound_update_email(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.h4a_inbound_ingest(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.h4a_inbound_save_scores(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.h4a_inbound_set_alert_email_status(text, uuid, text, text) to anon, authenticated;
