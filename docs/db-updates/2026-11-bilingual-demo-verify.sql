-- Verify the bilingual demo seed (read-only). Expect: sequences 2, steps 5, spanish_steps 5,
-- enrollments 4 (2 Spanish, 2 English), newsletter_es 1, outside_demo 0.
select
  (select count(*) from public.outreach_sequences s where s.workspace_id = w.id and s.name like 'Demo: % (bilingual)') as sequences,
  (select count(*) from public.outreach_sequence_steps st join public.outreach_sequences s on s.id = st.sequence_id
    where s.workspace_id = w.id and s.name like 'Demo: % (bilingual)') as steps,
  (select count(*) from public.outreach_sequence_steps st join public.outreach_sequences s on s.id = st.sequence_id
    where s.workspace_id = w.id and s.name like 'Demo: % (bilingual)' and st.body_es is not null) as spanish_steps,
  (select count(*) from public.outreach_enrollments e join public.outreach_sequences s on s.id = e.sequence_id
    where s.workspace_id = w.id and s.name like 'Demo: % (bilingual)') as enrollments,
  (select count(*) from public.outreach_enrollments e join public.outreach_sequences s on s.id = e.sequence_id
    join public.contacts c on c.id = e.contact_id
    where s.workspace_id = w.id and s.name like 'Demo: % (bilingual)' and c.language = 'es') as spanish_enrollments,
  (select count(*) from public.newsletters n where n.workspace_id = w.id and n.body_es is not null) as newsletter_es,
  (select count(*) from public.outreach_sequences s join public.workspaces x on x.id = s.workspace_id
    where s.name like 'Demo: % (bilingual)' and not (x.slug = 'demo' and x.is_demo)) as outside_demo
from public.workspaces w
where w.slug = 'demo' and w.is_demo;
