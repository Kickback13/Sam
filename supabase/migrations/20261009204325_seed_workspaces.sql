-- =============================================================================
-- Seed: workspaces + pipelines + stages + integration rows.
-- Configuration only — Sam's workspaces contain no records until he adds them.
-- Idempotent: safe to re-run.
-- =============================================================================

insert into public.workspaces (name, slug, business_type, is_demo, brand, profile)
values
  (
    'Housing4All Premier Solutions', 'housing4all', 'real_estate', false,
    jsonb_build_object(
      'primary', '#2F439A', 'primaryDeep', '#202F8B',
      'accent', '#00D9E1', 'accentText', '#007B82',
      'danger', '#B42318', 'ink', '#0B0C10', 'surface', '#E8FBFC',
      'displayFont', 'plus-jakarta-sans', 'bodyFont', 'source-sans-3',
      'logoText', 'H4A'
    ),
    jsonb_build_object(
      'legal_name', 'Housing4All Premier Solutions',
      'license', 'DRE #01735348',
      'phone', '(619) 843-1663',
      'address', '3683 University Ave, San Diego, CA 92104',
      'offices', jsonb_build_array(
        jsonb_build_object('name', 'San Diego', 'address', '3683 University Ave, San Diego, CA 92104', 'phone', '(619) 843-1663')
      )
    )
  ),
  (
    'AZH Builders', 'azh-builders', 'construction', false,
    jsonb_build_object(
      'primary', '#111110', 'primaryDeep', '#1C1C1A',
      'accent', '#FFC20E', 'accentText', '#8A6400',
      'danger', '#D62718', 'ink', '#111110', 'surface', '#F3F3F0',
      'displayFont', 'big-shoulders-display', 'bodyFont', 'barlow',
      'logoText', 'AZH'
    ),
    jsonb_build_object(
      'legal_name', 'AZH Builders',
      'phone', '(619) 202-0679',
      'address', '3683 University Ave, San Diego, CA 92104',
      'offices', jsonb_build_array(
        jsonb_build_object('name', 'San Diego', 'address', '3683 University Ave, San Diego, CA 92104', 'phone', '(619) 202-0679'),
        jsonb_build_object('name', 'Fallbrook', 'address', '532 E. Fallbrook Ave, Fallbrook, CA', 'phone', '(760) 691-5000')
      )
    )
  ),
  (
    'Demo Workspace', 'demo', 'real_estate', true,
    jsonb_build_object(
      'primary', '#3F3F46', 'primaryDeep', '#27272A',
      'accent', '#C4B5FD', 'accentText', '#6D28D9',
      'danger', '#B42318', 'ink', '#0B0C10', 'surface', '#F5F3FF',
      'displayFont', 'plus-jakarta-sans', 'bodyFont', 'source-sans-3',
      'logoText', 'DEMO'
    ),
    jsonb_build_object('legal_name', 'Demo Workspace (fictional data)')
  )
on conflict (slug) do nothing;

-- Pipelines --------------------------------------------------------------------
insert into public.pipelines (workspace_id, name, kind, position, is_default)
select w.id, 'Acquisitions', 'acquisition', 0, true
from public.workspaces w
where w.slug in ('housing4all', 'demo')
  and not exists (select 1 from public.pipelines p where p.workspace_id = w.id and p.name = 'Acquisitions');

insert into public.pipelines (workspace_id, name, kind, position, is_default)
select w.id, 'Projects', 'construction_project', 0, true
from public.workspaces w
where w.slug = 'azh-builders'
  and not exists (select 1 from public.pipelines p where p.workspace_id = w.id and p.name = 'Projects');

-- Stages -------------------------------------------------------------------------
insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color, is_won, is_lost, probability)
select p.workspace_id, p.id, s.name, s.position, s.color, s.is_won, s.is_lost, s.probability
from public.pipelines p
join public.workspaces w on w.id = p.workspace_id
cross join (values
  ('New Deal',     1, '#64748B', false, false,   5),
  ('Qualified',    2, '#0EA5E9', false, false,  15),
  ('Contacted',    3, '#6366F1', false, false,  25),
  ('Interested',   4, '#8B5CF6', false, false,  40),
  ('Underwriting', 5, '#F59E0B', false, false,  60),
  ('Offer',        6, '#F97316', false, false,  80),
  ('Closed',       7, '#16A34A', true,  false, 100),
  ('Lost',         8, '#DC2626', false, true,    0)
) as s(name, position, color, is_won, is_lost, probability)
where w.slug in ('housing4all', 'demo')
  and p.name = 'Acquisitions'
  and not exists (select 1 from public.pipeline_stages x where x.pipeline_id = p.id);

insert into public.pipeline_stages (workspace_id, pipeline_id, name, position, color, is_won, is_lost, probability)
select p.workspace_id, p.id, s.name, s.position, s.color, s.is_won, s.is_lost, s.probability
from public.pipelines p
join public.workspaces w on w.id = p.workspace_id
cross join (values
  ('Lead',        1, '#64748B', false, false,  10),
  ('Estimate',    2, '#0EA5E9', false, false,  25),
  ('Bid Sent',    3, '#6366F1', false, false,  50),
  ('Won',         4, '#16A34A', true,  false, 100),
  ('In Progress', 5, '#F59E0B', true,  false, 100),
  ('Complete',    6, '#0D9488', true,  false, 100),
  ('Review',      7, '#8B5CF6', true,  false, 100),
  ('Lost',        8, '#DC2626', false, true,    0)
) as s(name, position, color, is_won, is_lost, probability)
where w.slug = 'azh-builders'
  and p.name = 'Projects'
  and not exists (select 1 from public.pipeline_stages x where x.pipeline_id = p.id);

-- Integration rows (all "not connected" until a later phase connects them) -----
insert into public.integrations (workspace_id, provider)
select w.id, p.provider
from public.workspaces w
cross join (values ('gohighlevel'), ('google'), ('twilio'), ('elevenlabs'), ('resend'), ('data_api'), ('mapbox')) as p(provider)
where w.slug in ('housing4all', 'azh-builders', 'demo')
on conflict (workspace_id, provider) do nothing;
