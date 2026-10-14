-- =============================================================================
-- AZH Track: "AZH Demo" workspace (is_demo = true, construction).
-- The original Demo workspace is real estate, so every AZH sample record lives
-- here. Configuration only in this file; sample data is in *_azh_seed_demo.sql.
-- Idempotent: safe to re-run.
-- =============================================================================

insert into public.workspaces (name, slug, business_type, is_demo, brand, profile)
values (
  'AZH Demo Workspace', 'demo-azh', 'construction', true,
  jsonb_build_object(
    'primary', '#111110', 'primaryDeep', '#1C1C1A',
    'accent', '#FFC20E', 'accentText', '#8A6400',
    'danger', '#D62718', 'ink', '#111110', 'surface', '#F3F3F0',
    'displayFont', 'big-shoulders-display', 'bodyFont', 'barlow',
    'logoText', 'DEMO'
  ),
  jsonb_build_object(
    'legal_name', 'AZH Demo Workspace (fictional data)',
    'offices', jsonb_build_array(
      jsonb_build_object('name', 'San Diego', 'address', '3683 University Ave, San Diego, CA 92104', 'phone', '(619) 202-0679'),
      jsonb_build_object('name', 'Fallbrook', 'address', '532 E. Fallbrook Ave, Fallbrook, CA', 'phone', '(760) 691-5000')
    )
  )
)
on conflict (slug) do nothing;

-- Projects pipeline (same stages as AZH Builders) -------------------------------
insert into public.pipelines (workspace_id, name, kind, position, is_default)
select w.id, 'Projects', 'construction_project', 0, true
from public.workspaces w
where w.slug = 'demo-azh'
  and not exists (select 1 from public.pipelines p where p.workspace_id = w.id and p.name = 'Projects');

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
where w.slug = 'demo-azh'
  and p.name = 'Projects'
  and not exists (select 1 from public.pipeline_stages x where x.pipeline_id = p.id);

insert into public.integrations (workspace_id, provider)
select w.id, p.provider
from public.workspaces w
cross join (values ('gohighlevel'), ('google'), ('twilio'), ('elevenlabs'), ('resend'), ('data_api'), ('mapbox')) as p(provider)
where w.slug = 'demo-azh'
on conflict (workspace_id, provider) do nothing;

-- Whoever can already see the real-estate Demo gets the same role in the AZH
-- Demo (no hardcoded accounts; on a fresh database this inserts nothing).
insert into public.workspace_members (workspace_id, user_id, role)
select azh.id, m.user_id, m.role
from public.workspace_members m
join public.workspaces demo on demo.id = m.workspace_id and demo.slug = 'demo'
cross join public.workspaces azh
where azh.slug = 'demo-azh'
on conflict (workspace_id, user_id) do nothing;
