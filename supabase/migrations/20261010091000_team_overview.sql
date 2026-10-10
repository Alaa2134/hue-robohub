-- The founder's dashboard (one screen for the whole team) and a weekly report to the overseers and to
-- each sector's heads, every Sunday morning (team rule "weekly_report").

/** Overseers: the whole team at a glance — people, tasks in the last 30 days, warnings, each sector, each person. */
create or replace function public.staff_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  k public.team_settings := private.team_rules();
  v_from timestamptz := now() - interval '30 days';
  v_win timestamptz;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_win := now() - make_interval(days => k.warn_window_days);
  return jsonb_build_object(
    'team', jsonb_build_object(
      'members', (select count(*) from public.staff where active),
      'in_sectors', (select count(distinct m.staff_id) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.active),
      'heads', (select count(distinct m.staff_id) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.active and m.is_head),
      'sectors', (select count(*) from public.sectors where not archived)),
    'tasks', (select jsonb_build_object(
        'given', count(*),
        'on_time', count(*) filter (where a.submitted_at is not null and not a.late),
        'late', count(*) filter (where a.late),
        'missed', count(*) filter (where a.missed_at is not null),
        'open', count(*) filter (where t.status = 'open' and a.state in ('todo', 'doing', 'redo')),
        'overdue', count(*) filter (where t.status = 'open' and a.state in ('todo', 'doing', 'redo') and coalesce(a.due_at, t.due_at) < now()),
        'to_review', count(*) filter (where t.status = 'open' and a.state = 'submitted'))
      from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
     where t.status <> 'cancelled' and not a.excused and t.created_at > v_from),
    'warnings', jsonb_build_object(
      'active', (select count(*) from public.staff_warnings where cancelled_at is null and created_at > v_win),
      'appeals', (select count(*) from public.staff_warnings where appeal_status = 'pending'),
      'requests', (select count(*) from public.staff_task_requests where status = 'pending')),
    'sectors', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'color', s.color,
          'members', (select count(*) from public.sector_members m where m.sector_id = s.id and m.active),
          'given', x.given, 'done', x.done, 'on_time', x.on_time, 'missed', x.missed, 'overdue', x.overdue,
          'warnings', (select count(*) from public.staff_warnings w where w.sector_id = s.id and w.cancelled_at is null and w.created_at > v_win))
        order by s.name)
        from public.sectors s
        cross join lateral (
          select count(*) as given,
                 count(*) filter (where a.submitted_at is not null or a.state = 'approved') as done,
                 count(*) filter (where a.submitted_at is not null and not a.late) as on_time,
                 count(*) filter (where a.missed_at is not null) as missed,
                 count(*) filter (where t.status = 'open' and a.state in ('todo', 'doing', 'redo') and coalesce(a.due_at, t.due_at) < now()) as overdue
            from public.staff_tasks t join public.staff_task_assignees a on a.task_id = t.id
           where t.sector_id = s.id and t.status <> 'cancelled' and not a.excused and t.created_at > v_from) x
       where not s.archived), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(p order by (p ->> 'warnings')::int desc, (p ->> 'missed')::int desc)
        from (select jsonb_build_object(
                'staff_id', st.user_id, 'name', private.staff_name(st.user_id), 'title', st.title,
                'assigned', count(a.task_id),
                'on_time', count(a.task_id) filter (where a.submitted_at is not null and not a.late),
                'late', count(a.task_id) filter (where a.late),
                'missed', count(a.task_id) filter (where a.missed_at is not null),
                'warnings', (select count(*) from public.staff_warnings w where w.staff_id = st.user_id and w.cancelled_at is null and w.created_at > v_win)) as p
                from public.staff st
                left join public.staff_task_assignees a on a.staff_id = st.user_id and not a.excused
                     and exists (select 1 from public.staff_tasks t where t.id = a.task_id and t.status <> 'cancelled' and t.created_at > v_from)
               where st.active
               group by st.user_id, st.title) q), '[]'::jsonb),
    'org', jsonb_build_object(
      'students', (select count(*) from public.students where active),
      'applications_new', (select count(*) from public.applications where status = 'new'),
      'responses_new', (select count(*) from public.form_responses where status = 'new')),
    'rules', to_jsonb(k) - 'id' - 'updated_by');
end $$;
revoke execute on function public.staff_overview() from public, anon;
grant execute on function public.staff_overview() to authenticated;

/** Sunday morning: last week's numbers to the overseers, and each sector's to its heads. */
create or replace function private.team_weekly_report() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k public.team_settings := private.team_rules();
  v_from timestamptz := now() - interval '7 days';
  x record;
  s record;
  v_best text;
begin
  if not k.weekly_report then
    return;
  end if;
  select count(*) filter (where a.submitted_at >= v_from and not a.late) as on_time,
         count(*) filter (where a.submitted_at >= v_from and a.late) as late,
         count(*) filter (where a.missed_at >= v_from) as missed,
         count(*) filter (where t.status = 'open' and a.state in ('todo', 'doing', 'redo') and coalesce(a.due_at, t.due_at) < now()) as overdue
    into x
    from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
   where t.status <> 'cancelled' and not a.excused;
  select private.staff_name(a.staff_id) into v_best
    from public.staff_task_assignees a
   where a.submitted_at >= v_from and not a.late
   group by a.staff_id order by count(*) desc limit 1;
  perform private.notify_staff_users(private.overseer_ids(), '📊 تقرير الأسبوع',
    x.on_time || ' تسليم في الميعاد · ' || x.late || ' متأخر · ' || x.missed || ' فاتهم الميعاد · '
      || (select count(*) from public.staff_warnings where created_at >= v_from and cancelled_at is null) || ' إنذار جديد'
      || case when x.overdue > 0 then ' · ' || x.overdue || ' لسه متأخرين' else '' end
      || coalesce(' · الأنشط: ' || v_best, ''),
    '/app/#/staff/overview');
  for s in select id, name from public.sectors where not archived loop
    select count(*) filter (where a.submitted_at >= v_from and not a.late) as on_time,
           count(*) filter (where a.submitted_at >= v_from and a.late) as late,
           count(*) filter (where a.missed_at >= v_from) as missed,
           count(*) filter (where t.status = 'open' and a.state = 'submitted') as to_review
      into x
      from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
     where t.sector_id = s.id and t.status <> 'cancelled' and not a.excused;
    if x.on_time + x.late + x.missed + x.to_review > 0 then
      perform private.notify_staff_users(private.sector_heads(s.id), '📊 أسبوع ' || s.name,
        x.on_time || ' في الميعاد · ' || x.late || ' متأخر · ' || x.missed || ' فاتهم الميعاد'
          || case when x.to_review > 0 then ' · ' || x.to_review || ' مستني مراجعتك' else '' end,
        '/app/#/staff/sectors/' || s.id);
    end if;
  end loop;
end $$;
revoke execute on function private.team_weekly_report() from public, anon, authenticated;

select cron.schedule('buildx-team-weekly', '7 6 * * 0', $$select private.team_weekly_report()$$);
