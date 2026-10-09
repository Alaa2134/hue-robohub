-- Sectors and team tasks, part 4: tasks — heads give them, members start and hand them in, heads review.

-- ─────────────────────────────────────────────────────────── tasks
-- Someone excused from a task (taken off it, or let off by a head) counts as done and gets no warning.
alter table public.staff_task_assignees add column if not exists excused boolean not null default false;

/** Heads (and overseers): give a task to members of the sector, or edit it. New assignees are told. */
create or replace function public.staff_task_save(
  p_id uuid, p_sector uuid, p_title text, p_description text, p_link text, p_priority text,
  p_due timestamptz, p_assignees uuid[], p_warn boolean default true
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_sector uuid := p_sector;
  v_old_due timestamptz;
  v_new uuid[];
  v_name text;
begin
  if p_id is not null then
    select sector_id, due_at into v_sector, v_old_due from public.staff_tasks where id = p_id and status <> 'cancelled';
    if v_sector is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;
  if v_sector is null or not private.leads_sector(v_sector) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_due is null or (p_id is null and p_due < now()) then
    raise exception 'due_in_past' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_assignees), 0) = 0 then
    raise exception 'no_assignees' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_assignees) as a(x)
              where not exists (select 1 from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
                                 where m.sector_id = v_sector and m.staff_id = a.x and m.active)) then
    raise exception 'not_member' using errcode = '22023';
  end if;
  select name into v_name from public.sectors where id = v_sector;

  if p_id is null then
    insert into public.staff_tasks (sector_id, title, description, link, priority, due_at, warn_on_miss)
    values (v_sector, btrim(p_title), coalesce(btrim(p_description), ''), nullif(btrim(p_link), ''), coalesce(p_priority, 'normal'), p_due, coalesce(p_warn, true))
    returning id into v_id;
  else
    update public.staff_tasks set title = btrim(p_title), description = coalesce(btrim(p_description), ''), link = nullif(btrim(p_link), ''),
           priority = coalesce(p_priority, 'normal'), due_at = p_due, warn_on_miss = coalesce(p_warn, true)
     where id = p_id;
    -- A later deadline: remind again before the new one.
    if p_due > v_old_due then
      update public.staff_task_assignees set reminded_at = null where task_id = p_id and submitted_at is null;
    end if;
    -- Taken off the task: excused (kept in the record).
    update public.staff_task_assignees set state = 'approved', excused = true, reviewed_by = auth.uid(), reviewed_at = now()
     where task_id = p_id and not staff_id = any(p_assignees) and state <> 'approved';
  end if;
  select coalesce(array_agg(x), '{}') into v_new from unnest(p_assignees) as x
   where not exists (select 1 from public.staff_task_assignees a where a.task_id = v_id and a.staff_id = x and not a.excused);
  -- (A deadline less than a day away is already in the new-task notice: no separate reminder.)
  insert into public.staff_task_assignees (task_id, staff_id, reminded_at)
  select v_id, x, case when p_due < now() + interval '1 day' then now() end from unnest(v_new) as x
  on conflict (task_id, staff_id) do update
    set state = 'todo', excused = false, reviewed_by = null, reviewed_at = null, submitted_at = null, late = false, missed_at = null,
        reminded_at = excluded.reminded_at
  where public.staff_task_assignees.excused;
  -- Open while anyone still has it to do.
  update public.staff_tasks set status = case when exists (select 1 from public.staff_task_assignees a where a.task_id = v_id and a.state <> 'approved') then 'open' else 'closed' end
   where id = v_id;

  if cardinality(v_new) > 0 then
    perform private.notify_staff_users(v_new,
      case when p_priority = 'urgent' then '🔴 تاسك عاجل: ' else 'تاسك جديد: ' end || btrim(p_title),
      v_name || ' · آخر ميعاد ' || to_char(p_due at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), '/app/#/staff/mytasks');
  end if;
  if p_id is not null and p_due <> v_old_due then
    perform private.notify_staff_users(array(select a.staff_id from public.staff_task_assignees a where a.task_id = v_id and a.submitted_at is null and not a.excused and not a.staff_id = any(v_new)),
      'اتغيّر ميعاد تاسك: ' || btrim(p_title), 'آخر ميعاد بقى ' || to_char(p_due at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), '/app/#/staff/mytasks');
  end if;
  return v_id;
end $$;

/** Heads: cancel a task (it stays in the record as cancelled). */
create or replace function public.staff_task_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
begin
  select * into t from public.staff_tasks where id = p_id;
  if not found or not private.leads_sector(t.sector_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_tasks set status = 'cancelled' where id = p_id;
  perform private.notify_staff_users(array(select staff_id from public.staff_task_assignees where task_id = p_id and state not in ('approved')),
    'اتلغى تاسك: ' || t.title, 'مش مطلوب منك خلاص.', '/app/#/staff/mytasks');
  return jsonb_build_object('ok', true);
end $$;

/** One task as JSON, with its assignees (all of them for the sector's heads; only me otherwise). */
create or replace function private.task_json(t public.staff_tasks, p_all boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(t) || jsonb_build_object(
    'sector_name', (select name from public.sectors where id = t.sector_id),
    'sector_color', (select color from public.sectors where id = t.sector_id),
    'created_by_name', private.staff_name(t.created_by),
    'assignees', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('name', private.staff_name(a.staff_id), 'reviewed_by_name', private.staff_name(a.reviewed_by))
                       order by private.staff_name(a.staff_id))
        from public.staff_task_assignees a where a.task_id = t.id and (p_all or a.staff_id = auth.uid())), '[]'::jsonb))
$$;
revoke execute on function private.task_json(public.staff_tasks, boolean) from public, anon, authenticated;

/** My tasks (given to me), newest deadline last; finished ones from the last 60 days. */
create or replace function public.staff_my_tasks() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.task_json(t, false) order by t.due_at)
      from public.staff_tasks t join public.staff_task_assignees a on a.task_id = t.id and a.staff_id = auth.uid()
     where t.status = 'open' or (t.status = 'closed' and t.updated_at > now() - interval '60 days')
        or (t.status = 'cancelled' and t.updated_at > now() - interval '7 days')), '[]'::jsonb);
end $$;

/** A sector's tasks (null = every sector, for overseers). */
create or replace function public.staff_sector_tasks(p_sector uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (p_sector is null and not private.oversees()) or (p_sector is not null and not private.leads_sector(p_sector)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.task_json(t, true) order by (t.status = 'open') desc, t.due_at desc)
      from public.staff_tasks t
     where t.id in (select x.id from public.staff_tasks x
                     where (p_sector is null or x.sector_id = p_sector) and (x.status <> 'cancelled' or x.updated_at > now() - interval '30 days')
                     order by x.due_at desc limit 300)), '[]'::jsonb);
end $$;

/** One task: for its sector's heads (everyone on it) or for someone it was given to (their part). */
create or replace function public.staff_task(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
  v_lead boolean;
begin
  select * into t from public.staff_tasks where id = p_id;
  if not found or not private.is_staff() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_lead := private.leads_sector(t.sector_id);
  if not v_lead and not exists (select 1 from public.staff_task_assignees where task_id = p_id and staff_id = auth.uid()) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return private.task_json(t, v_lead) || jsonb_build_object('leads', v_lead);
end $$;

/** The member: "I've started". */
create or replace function public.staff_task_start(p_task uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_task_assignees a set state = 'doing'
   where a.task_id = p_task and a.staff_id = auth.uid() and a.state = 'todo'
     and exists (select 1 from public.staff_tasks t where t.id = p_task and t.status = 'open');
  return jsonb_build_object('ok', found);
end $$;

/** The member hands the task in (a note and/or a link). Late if after the deadline. The heads are told. */
create or replace function public.staff_task_submit(p_task uuid, p_note text, p_link text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
  v_late boolean;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.staff_tasks where id = p_task and status = 'open';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if coalesce(btrim(p_note), '') = '' and coalesce(btrim(p_link), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  v_late := now() > t.due_at;
  update public.staff_task_assignees
     set state = 'submitted', note = nullif(btrim(p_note), ''), link = nullif(btrim(p_link), ''),
         submitted_at = now(), late = v_late
   where task_id = p_task and staff_id = auth.uid() and state <> 'approved';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  perform private.notify_staff_users(private.sector_heads(t.sector_id) || t.created_by,
    private.staff_name(auth.uid()) || ' سلّم: ' || t.title, case when v_late then 'متأخر عن الميعاد. ' else '' end || 'راجِعه من السيكتور.',
    '/app/#/staff/sectors/' || t.sector_id || '/' || t.id);
  return jsonb_build_object('ok', true, 'late', v_late);
end $$;

/** Heads: approve a hand-in, send it back with a note, or excuse the member. The task closes when everyone is done. */
create or replace function public.staff_task_review(p_task uuid, p_staff uuid, p_decision text, p_feedback text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
begin
  select * into t from public.staff_tasks where id = p_task;
  if not found or not private.leads_sector(t.sector_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'redo', 'excused') then
    raise exception 'bad decision' using errcode = '22023';
  end if;
  update public.staff_task_assignees
     set state = case when p_decision = 'redo' then 'redo' else 'approved' end, excused = p_decision = 'excused',
         feedback = nullif(btrim(p_feedback), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where task_id = p_task and staff_id = p_staff;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_decision = 'redo' then
    update public.staff_tasks set status = 'open' where id = p_task and status = 'closed';
  elsif not exists (select 1 from public.staff_task_assignees where task_id = p_task and state <> 'approved') then
    update public.staff_tasks set status = 'closed' where id = p_task and status = 'open';
  end if;
  perform private.notify_staff_users(array[p_staff],
    case p_decision when 'approved' then '✅ اتقبل: ' when 'excused' then 'اتعفيت من: ' else '↩️ محتاج تعديل: ' end || t.title,
    coalesce(nullif(btrim(p_feedback), ''), case p_decision when 'approved' then 'شغل حلو 👏' when 'excused' then 'مش مطلوب منك.' else 'شوف الملاحظة وسلّمه تاني.' end),
    '/app/#/staff/mytasks');
  return jsonb_build_object('ok', true);
end $$;
