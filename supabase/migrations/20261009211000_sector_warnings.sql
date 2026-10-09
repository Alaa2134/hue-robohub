-- Sectors and team tasks, part 5: warnings, the home summary, access to every function, and the 10-minute sweep
-- (reminders a day before, warnings for missed deadlines).

-- ─────────────────────────────────────────────────────────── warnings
/** Heads (for a member of their sector) and overseers (anyone): a warning by hand. */
create or replace function public.staff_warning_give(p_staff uuid, p_reason text, p_sector uuid default null, p_task uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.oversees() or (p_sector is not null and private.leads_sector(p_sector)
          and exists (select 1 from public.sector_members where sector_id = p_sector and staff_id = p_staff and active))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_staff = auth.uid() then
    raise exception 'not yourself' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff where user_id = p_staff and role = 'owner') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.staff_warnings (staff_id, sector_id, task_id, kind, reason, issued_by)
  values (p_staff, p_sector, p_task, 'manual', btrim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

/** Overseers: cancel a warning (kept in the record as cancelled, with why). */
create or replace function public.staff_warning_cancel(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_warnings set cancelled_at = now(), cancelled_by = auth.uid(), cancel_note = nullif(left(btrim(p_note), 300), '')
   where id = p_id and cancelled_at is null
  returning staff_id into v_staff;
  if v_staff is not null then
    perform private.notify_staff_users(array[v_staff], 'اتلغى إنذار ليك', coalesce(nullif(btrim(p_note), ''), 'الإنذار اتشال من سجلك.'), '/app/#/staff/mytasks');
  end if;
  return jsonb_build_object('ok', v_staff is not null);
end $$;

/** I've seen my warnings. */
create or replace function public.staff_warnings_seen() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_warnings set seen_at = now() where staff_id = auth.uid() and seen_at is null;
  return jsonb_build_object('ok', true);
end $$;

/** Warnings: 'mine', a sector's ('sector', for its heads), or everyone's ('all', for overseers). */
create or replace function public.staff_warnings(p_scope text default 'mine', p_sector uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff()
     or (p_scope = 'sector' and not private.leads_sector(p_sector))
     or (p_scope = 'all' and not private.oversees())
     or p_scope not in ('mine', 'sector', 'all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(w) || jsonb_build_object(
             'name', private.staff_name(w.staff_id),
             'issued_by_name', private.staff_name(w.issued_by),
             'cancelled_by_name', private.staff_name(w.cancelled_by),
             'sector_name', (select name from public.sectors where id = w.sector_id),
             'task_title', (select title from public.staff_tasks where id = w.task_id))
           order by w.created_at desc)
      from (select * from public.staff_warnings w
             where case p_scope when 'mine' then w.staff_id = auth.uid()
                                when 'sector' then w.sector_id = p_sector
                                else true end
             order by w.created_at desc limit 300) w), '[]'::jsonb);
end $$;

/** For the home screen: my open and late tasks, unseen warnings, and (heads) hand-ins waiting. */
create or replace function public.staff_my_summary() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
              where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo')),
    'overdue', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                 where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo') and t.due_at < now()),
    'due_soon', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                  where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo') and t.due_at between now() and now() + interval '1 day'),
    'warnings_unseen', (select count(*) from public.staff_warnings where staff_id = v_me and seen_at is null and cancelled_at is null),
    'warnings_active', (select count(*) from public.staff_warnings where staff_id = v_me and cancelled_at is null and created_at > now() - interval '90 days'),
    'sectors', (select count(*) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.staff_id = v_me and m.active),
    'heads', (select count(*) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.staff_id = v_me and m.is_head and m.active),
    'to_review', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                   where t.status = 'open' and a.state = 'submitted'
                     and (private.oversees() or exists (select 1 from public.sector_members h where h.sector_id = t.sector_id and h.staff_id = v_me and h.is_head and h.active))),
    'oversees', private.oversees());
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_sectors()', 'public.staff_sector_save(uuid, text, text, text, boolean)', 'public.staff_sector_members(uuid, jsonb)',
    'public.staff_task_save(uuid, uuid, text, text, text, text, timestamptz, uuid[], boolean)', 'public.staff_task_cancel(uuid)',
    'public.staff_my_tasks()', 'public.staff_sector_tasks(uuid)', 'public.staff_task(uuid)', 'public.staff_task_start(uuid)',
    'public.staff_task_submit(uuid, text, text)', 'public.staff_task_review(uuid, uuid, text, text)',
    'public.staff_warning_give(uuid, text, uuid, uuid)', 'public.staff_warning_cancel(uuid, text)', 'public.staff_warnings_seen()',
    'public.staff_warnings(text, uuid)', 'public.staff_my_summary()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────── every 10 minutes: reminders and missed deadlines
create or replace function private.staff_task_sweep() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  -- A day before: remind whoever hasn't handed it in.
  for r in
    update public.staff_task_assignees a set reminded_at = now()
      from public.staff_tasks t
     where t.id = a.task_id and t.status = 'open' and a.submitted_at is null and a.state <> 'approved' and a.reminded_at is null
       and t.due_at between now() and now() + interval '1 day'
    returning a.staff_id, t.title, t.due_at
  loop
    perform private.notify_staff_users(array[r.staff_id], '⏰ فاضل أقل من يوم: ' || r.title,
      'آخر ميعاد ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || '. لو ماسلّمتش هيجيلك إنذار.', '/app/#/staff/mytasks');
  end loop;
  -- Deadline passed with nothing handed in: a warning (if the task gives one), and the heads are told.
  for r in
    update public.staff_task_assignees a set missed_at = now()
      from public.staff_tasks t
     where t.id = a.task_id and t.status = 'open' and a.submitted_at is null and a.state <> 'approved' and a.missed_at is null and t.due_at < now()
    returning a.staff_id, t.id as task_id, t.sector_id, t.title, t.due_at, t.warn_on_miss, t.created_by
  loop
    if r.warn_on_miss then
      insert into public.staff_warnings (staff_id, sector_id, task_id, kind, reason)
      values (r.staff_id, r.sector_id, r.task_id, 'missed',
              'ما سلّمتش تاسك «' || left(r.title, 140) || '» في ميعاده (' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || ').')
      on conflict do nothing;
    else
      perform private.notify_staff_users(array[r.staff_id], 'فات ميعاد: ' || r.title, 'لسه تقدر تسلّمه متأخر.', '/app/#/staff/mytasks');
    end if;
    perform private.notify_staff_users(private.sector_heads(r.sector_id) || r.created_by,
      private.staff_name(r.staff_id) || ' ما سلّمش: ' || r.title, case when r.warn_on_miss then 'اتبعتله إنذار تلقائي.' else 'الميعاد فات.' end,
      '/app/#/staff/sectors/' || r.sector_id || '/' || r.task_id);
  end loop;
end $$;
revoke execute on function private.staff_task_sweep() from public, anon, authenticated;

select cron.schedule('buildx-staff-tasks', '*/10 * * * *', $$select private.staff_task_sweep()$$);
