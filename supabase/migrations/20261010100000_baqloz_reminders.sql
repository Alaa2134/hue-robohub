-- Baqloz in the BuildX App: what's on this team member right now, most urgent first, each with where
-- to go — tasks late, due soon, sent back or not started; a new warning; a meeting now or soon; and for
-- heads and overseers, hand-ins to review, requests and appeals; plus unread notifications.

create or replace function public.staff_reminders() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  k public.team_settings := private.team_rules();
  v_all boolean := private.oversees();
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by (x ->> 'rank')::int, x ->> 'at' nulls last)
      from (
        -- My open tasks.
        select jsonb_build_object(
                 'kind', z.kind, 'rank', case z.kind when 'overdue' then 1 when 'redo' then 2 when 'due_soon' then 3 else 6 end,
                 'id', z.id, 'title', z.title, 'at', z.due, 'sector', z.sector, 'to', '/staff/mytasks?t=' || z.id) as x
          from (select t.id, t.title, s.name as sector, coalesce(a.due_at, t.due_at) as due,
                       case when a.state = 'redo' then 'redo'
                            when coalesce(a.due_at, t.due_at) < now() then 'overdue'
                            when coalesce(a.due_at, t.due_at) < now() + make_interval(hours => k.remind_hours) then 'due_soon'
                            when a.state = 'todo' and t.created_at < now() - interval '1 day' then 'not_started' end as kind
                  from public.staff_task_assignees a
                  join public.staff_tasks t on t.id = a.task_id and t.status = 'open'
                  join public.sectors s on s.id = t.sector_id
                 where a.staff_id = v_me and a.state in ('todo', 'doing', 'redo')) z
         where z.kind is not null
        union all
        -- A warning I haven't seen.
        select jsonb_build_object('kind', 'warning', 'rank', 2, 'id', w.id, 'title', w.reason, 'at', w.created_at, 'to', '/staff/mytasks')
          from public.staff_warnings w where w.staff_id = v_me and w.seen_at is null and w.cancelled_at is null
        union all
        -- A meeting now (attendance open and I'm not in) or in the next 24 hours.
        select jsonb_build_object('kind', case when g.status = 'open' then 'meeting_open' else 'meeting' end,
                 'rank', case when g.status = 'open' then 1 else 4 end, 'id', g.id, 'title', g.title, 'at', g.starts_at, 'place', g.place,
                 'to', '/staff/meetings/' || g.id)
          from public.sector_meetings g
         where (g.status = 'open' or (g.status = 'scheduled' and g.starts_at between now() - interval '30 minutes' and now() + interval '24 hours'))
           and v_me = any(private.meeting_invitees(g.id))
           and not exists (select 1 from public.sector_meeting_attendance x where x.meeting_id = g.id and x.staff_id = v_me and x.status in ('present', 'late', 'excused'))
        union all
        -- Heads: hand-ins waiting for review, and requests.
        select jsonb_build_object('kind', 'review', 'rank', 5, 'id', t.id, 'title', t.title, 'count', count(*), 'at', min(a.submitted_at),
                 'to', '/staff/sectors/' || t.sector_id || '/' || t.id)
          from public.staff_tasks t join public.staff_task_assignees a on a.task_id = t.id and a.state = 'submitted'
         where t.status = 'open'
           and (v_all or exists (select 1 from public.sector_members h where h.sector_id = t.sector_id and h.staff_id = v_me and h.is_head and h.active))
         group by t.id
        union all
        select jsonb_build_object('kind', 'request', 'rank', 5, 'id', r.id, 'title', t.title, 'name', private.staff_name(r.staff_id), 'request', r.kind, 'at', r.created_at,
                 'to', '/staff/sectors/' || t.sector_id || '/' || t.id)
          from public.staff_task_requests r join public.staff_tasks t on t.id = r.task_id
         where r.status = 'pending'
           and (v_all or exists (select 1 from public.sector_members h where h.sector_id = t.sector_id and h.staff_id = v_me and h.is_head and h.active))
        union all
        -- Overseers: appeals.
        select jsonb_build_object('kind', 'appeal', 'rank', 5, 'count', count(*), 'at', min(w.appeal_at), 'to', '/staff/warnings')
          from public.staff_warnings w where v_all and w.appeal_status = 'pending' having count(*) > 0
        union all
        -- Notifications not read yet.
        select jsonb_build_object('kind', 'unread', 'rank', 9, 'count', count(*), 'at', max(i.created_at), 'to', '/staff/notifications')
          from public.staff_inbox i where i.staff_id = v_me and i.read_at is null having count(*) > 0
      ) q), '[]'::jsonb);
end $$;
revoke execute on function public.staff_reminders() from public, anon;
grant execute on function public.staff_reminders() to authenticated;
