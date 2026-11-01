-- The achievements page's numbers, straight from the records (nothing typed in): achievements and
-- podium results published, events held (with real check-ins), people who attended them, active
-- members, projects published, certificates issued — and the places of the events and achievements.
create or replace function public.achievements_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'achievements', (select count(*) from public.site_content where kind = 'achievement' and published),
    'podiums', (select count(*) from public.site_content where kind = 'achievement' and published
                 and coalesce(nullif(btrim(result_ar), ''), nullif(btrim(result), '')) is not null),
    'events', (select count(*) from public.forms f where f.event_at < now() and exists (
                 select 1 from public.form_attendance a join public.form_responses r on r.id = a.response_id where r.form_id = f.id and a.present)),
    'attendees', (select count(distinct a.response_id) from public.form_attendance a where a.present),
    'members', (select count(*) from public.students where active),
    'projects', (select count(*) from public.site_content where kind = 'project' and published)
                + (select count(*) from public.student_projects where status = 'published'),
    'certificates', (select count(*) from public.certificates where revoked_at is null),
    'places', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'name_en', name_en, 'n', n) order by n desc)
                          from (select coalesce(nullif(btrim(location_ar), ''), location) as name,
                                       max(coalesce(nullif(btrim(location), ''), location_ar)) as name_en, count(*) as n
                                  from public.site_content
                                 where published and kind in ('event', 'achievement') and coalesce(nullif(btrim(location_ar), ''), nullif(btrim(location), '')) is not null
                                 group by 1) p), '[]'::jsonb))
$$;
revoke all on function public.achievements_stats() from public;
grant execute on function public.achievements_stats() to anon, authenticated;
