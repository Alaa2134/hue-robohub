-- Coach tools:
--   Students who need a word: missed their group's last two sessions in a row, or nothing from them
--   in 14 days (no attendance, quiz, file opened or sign-in). A list in the app, and every Sunday at
--   9 am Cairo the team that handles students hears how many.
--   Scheduled content: a lecture or file can wait for a time; it publishes itself then (checked every
--   10 minutes), and the group gets the usual "new content" notification.

alter table public.materials add column if not exists publish_at timestamptz;
create index if not exists materials_publish_at_idx on public.materials (publish_at) where publish_at is not null and not published;

create or replace function private.publish_scheduled_materials() returns void
language sql security definer set search_path = ''
as $$
  update public.materials set published = true, publish_at = null
   where not published and publish_at is not null and publish_at <= now()
$$;
revoke execute on function private.publish_scheduled_materials() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'buildx-publish-materials';
select cron.schedule('buildx-publish-materials', '*/10 * * * *', $$select private.publish_scheduled_materials()$$);

/** Students to follow up with, and why (one group or all). */
create or replace function private.at_risk(p_group text default null) returns table (
  student_id uuid, name text, group_name text, phone text, missed_in_row int, last_seen timestamptz, reasons text[]
)
language sql stable security definer set search_path = ''
as $$
  with st as (
    select s.id, s.full_name, s.group_name, s.phone, s.created_at from public.students s
     where s.active and (p_group is null or p_group = '' or s.group_name = p_group)
       and s.created_at < now() - interval '7 days'
  ), recent as (
    -- The group's last two closed sessions, newest first.
    select st.id as student_id, se.id as session_id, row_number() over (partition by st.id order by se.starts_at desc) as n
      from st join public.attendance_sessions se on se.closed_at is not null and (se.group_name = '' or se.group_name = st.group_name)
                                                 and se.starts_at >= st.created_at - interval '1 day'
  ), missed as (
    select r.student_id, count(*) filter (where a.session_id is null or a.status = 'absent') as missed, count(*) as total
      from recent r left join public.attendance a on a.session_id = r.session_id and a.student_id = r.student_id and a.status in ('present', 'late', 'absent', 'excused')
     where r.n <= 2 group by r.student_id
  ), seen as (
    select st.id as student_id, greatest(
      (select max(a.marked_at) from public.attendance a where a.student_id = st.id and a.status in ('present', 'late')),
      (select max(q.started_at) from public.quiz_attempts q where q.student_id = st.id),
      (select max(v.first_at) from public.material_views v where v.student_id = st.id),
      (select x.last_login_at from private.student_secrets x where x.student_id = st.id)) as last_seen
      from st
  )
  select st.id, st.full_name, st.group_name, st.phone, coalesce(m.missed, 0)::int, seen.last_seen,
         array_remove(array[
           case when m.total = 2 and m.missed = 2 then 'missed_two' end,
           case when coalesce(seen.last_seen, st.created_at) < now() - interval '14 days' then 'inactive' end
         ], null)
    from st left join missed m on m.student_id = st.id join seen on seen.student_id = st.id
   where (m.total = 2 and m.missed = 2) or coalesce(seen.last_seen, st.created_at) < now() - interval '14 days'
$$;
revoke execute on function private.at_risk(text) from public, anon, authenticated;

create or replace function public.staff_at_risk(p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can('students') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.student_id, 'name', r.name, 'group', r.group_name, 'phone', r.phone,
                     'missed', r.missed_in_row, 'lastSeen', r.last_seen, 'reasons', to_jsonb(r.reasons)) order by r.group_name, r.name)
                     from private.at_risk(p_group) r), '[]'::jsonb);
end $$;
revoke execute on function public.staff_at_risk(text) from public, anon;
grant execute on function public.staff_at_risk(text) to authenticated;

create or replace function private.weekly_coach_report() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
  v_missed int;
begin
  select count(*), count(*) filter (where 'missed_two' = any(reasons)) into v_n, v_missed from private.at_risk(null);
  if v_n > 0 then
    perform private.notify_staff('students', 'تقرير الأسبوع: ' || v_n || ' طالب محتاج متابعة 👀',
      v_missed || ' غابوا آخر سيشنين · ' || (v_n - v_missed) || ' مختفيين من أسبوعين', '/app/#/staff/at-risk');
  end if;
end $$;
revoke execute on function private.weekly_coach_report() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'buildx-weekly-coach-report';
-- Sunday 07:03 UTC = 9:03 / 10:03 Cairo.
select cron.schedule('buildx-weekly-coach-report', '3 7 * * 0', $$select private.weekly_coach_report()$$);
