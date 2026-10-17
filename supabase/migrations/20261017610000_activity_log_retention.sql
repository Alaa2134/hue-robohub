-- The activity log keeps who did what and when; the copies of changed and deleted records in it (and the
-- values kept apart for putting a row back) go after 180 days, like the other security records.
create or replace function private.audit_trim()
returns void language sql security definer set search_path = '' as $$
  update private.audit_secrets s set data = '{}'::jsonb
    from public.audit_log a
   where a.id = s.audit_id and a.at < now() - interval '180 days' and s.data <> '{}'::jsonb;
  update public.audit_log set detail = ((detail - 'row') - 'ch') || '{"trimmed": true}'::jsonb
   where at < now() - interval '180 days' and (detail ? 'row' or detail ? 'ch');
$$;
revoke all on function private.audit_trim() from public, anon, authenticated;

select cron.schedule('buildx-audit-trim', '37 3 * * *', 'select private.audit_trim()');
