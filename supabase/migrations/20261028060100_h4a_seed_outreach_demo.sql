-- =============================================================================
-- Seed: outreach demo (Demo workspaces ONLY — is_demo = true).
-- Fictional sender details (@example.com, "Example" street) and one draft
-- newsletter per demo workspace, so the Outreach screens have something to
-- show. Nothing is sent. Idempotent: skipped where settings already exist.
-- =============================================================================

insert into public.outreach_settings (workspace_id, sender_name, from_email, reply_to, mailing_address, updated_by)
select w.id,
       w.name,
       'news@example.com',
       'hello@example.com',
       '100 Example St, San Diego, CA 92104 (demo address)',
       null
from public.workspaces w
where w.is_demo and w.slug in ('demo', 'demo-azh')
on conflict (workspace_id) do nothing;

insert into public.newsletters (workspace_id, subject, preheader, body, audience, created_by, updated_by)
select w.id,
       case when w.business_type = 'construction'
            then 'Demo: fall project roundup'
            else 'Demo: San Diego multifamily update' end,
       'Sample newsletter — demo data only',
       case when w.business_type = 'construction'
            then E'# Fall project roundup\n\nThis is a **demo newsletter** with fictional content.\n\n- A sample ADU wrapped up in North Park\n- A sample tenant improvement started downtown\n\nQuestions? [Reply to this email](mailto:hello@example.com).'
            else E'# San Diego multifamily update\n\nThis is a **demo newsletter** with fictional content.\n\n- Sample market note one\n- Sample market note two\n\nThinking of selling? [Reply to this email](mailto:hello@example.com).' end,
       '{}'::jsonb,
       null,
       null
from public.workspaces w
where w.is_demo and w.slug in ('demo', 'demo-azh')
  and not exists (select 1 from public.newsletters n where n.workspace_id = w.id);
