-- Sectors and team tasks, part 3: who is in each sector and who heads it. Someone taken out of a sector
-- is kept as inactive (their tasks and warnings stay readable), and comes back if added again.

alter table public.sector_members add column if not exists active boolean not null default true;

/** Runs this sector: oversees everything, or is one of its (active) heads. */
create or replace function private.leads_sector(p_sector uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.oversees() or (private.is_staff() and exists (
    select 1 from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
     where m.sector_id = p_sector and m.staff_id = auth.uid() and m.is_head and m.active))
$$;

/** A sector's heads (active accounts). */
create or replace function private.sector_heads(p_sector uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.staff_id), '{}') from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
   where m.sector_id = p_sector and m.is_head and m.active
$$;

/** The sectors I can see (all of them when I oversee), their people and, for those I run, how each member is doing. */
create or replace function public.staff_sectors() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_all boolean;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_all := private.oversees();
  return jsonb_build_object(
    'oversees', v_all,
    'sectors', coalesce((
      select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object(
          'id', sc.id, 'name', sc.name, 'description', sc.description, 'color', sc.color, 'archived', sc.archived,
          'is_head', exists (select 1 from public.sector_members h where h.sector_id = sc.id and h.staff_id = v_me and h.is_head and h.active),
          'leads', v_all or exists (select 1 from public.sector_members h where h.sector_id = sc.id and h.staff_id = v_me and h.is_head and h.active),
          'open_tasks', (select count(*) from public.staff_tasks t where t.sector_id = sc.id and t.status = 'open'),
          'to_review', (select count(*) from public.staff_tasks t join public.staff_task_assignees a on a.task_id = t.id
                         where t.sector_id = sc.id and t.status = 'open' and a.state = 'submitted'),
          'overdue', (select count(*) from public.staff_tasks t join public.staff_task_assignees a on a.task_id = t.id
                       where t.sector_id = sc.id and t.status = 'open' and a.submitted_at is null and a.state <> 'approved' and t.due_at < now()),
          'warnings', (select count(*) from public.staff_warnings w where w.sector_id = sc.id and w.cancelled_at is null and w.created_at > now() - interval '90 days'),
          'members', coalesce((
            select jsonb_agg(jsonb_build_object(
                'staff_id', m.staff_id, 'name', private.staff_name(m.staff_id), 'title', s.title, 'is_head', m.is_head
              ) || case when v_all or exists (select 1 from public.sector_members h where h.sector_id = sc.id and h.staff_id = v_me and h.is_head and h.active) then (
                select jsonb_build_object(
                  'assigned', count(*),
                  'on_time', count(*) filter (where a.submitted_at is not null and not a.late),
                  'late', count(*) filter (where a.late),
                  'missed', count(*) filter (where a.missed_at is not null),
                  'open', count(*) filter (where t.status = 'open' and a.state in ('todo', 'doing', 'redo')),
                  'warnings', (select count(*) from public.staff_warnings w where w.staff_id = m.staff_id and w.cancelled_at is null and w.created_at > now() - interval '90 days'))
                  from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                 where a.staff_id = m.staff_id and t.sector_id = sc.id and t.status <> 'cancelled' and t.created_at > now() - interval '90 days')
              else '{}'::jsonb end
              order by m.is_head desc, private.staff_name(m.staff_id))
              from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
             where m.sector_id = sc.id and m.active), '[]'::jsonb)
        ) as x
          from public.sectors sc
         where v_all
            or (not sc.archived and exists (select 1 from public.sector_members me where me.sector_id = sc.id and me.staff_id = v_me and me.active))
      ) q), '[]'::jsonb),
    'staff', case when v_all then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', private.staff_name(s.user_id), 'title', s.title) order by private.staff_name(s.user_id))
        from public.staff s where s.active), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

/** Overseers: who is in a sector and who heads it ([{staff_id, is_head}]). New people are told. */
create or replace function public.staff_sector_members(p_sector uuid, p_members jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_ids uuid[];
  v_head_ids uuid[];
  v_new uuid[];
  v_heads uuid[];
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select name into v_name from public.sectors where id = p_sector;
  if v_name is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(s.user_id), '{}'), coalesce(array_agg(s.user_id) filter (where w.h), '{}') into v_ids, v_head_ids
    from (select (e ->> 'staff_id')::uuid as id, bool_or(coalesce((e ->> 'is_head')::boolean, false)) as h
            from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as e group by 1) w
    join public.staff s on s.user_id = w.id and s.active;
  select coalesce(array_agg(x), '{}') into v_new from unnest(v_ids) as x
   where not exists (select 1 from public.sector_members m where m.sector_id = p_sector and m.staff_id = x and m.active);
  select coalesce(array_agg(x), '{}') into v_heads from unnest(v_head_ids) as x
   where not exists (select 1 from public.sector_members m where m.sector_id = p_sector and m.staff_id = x and m.is_head and m.active);
  update public.sector_members m set active = false, is_head = false
   where m.sector_id = p_sector and m.active and not m.staff_id = any(v_ids);
  insert into public.sector_members (sector_id, staff_id, is_head)
  select p_sector, x, x = any(v_head_ids) from unnest(v_ids) as x
  on conflict (sector_id, staff_id) do update set is_head = excluded.is_head, active = true,
    added_at = case when public.sector_members.active then public.sector_members.added_at else now() end;
  if cardinality(v_heads) > 0 then
    perform private.notify_staff_users(v_heads, 'بقيت هيد ' || v_name, 'تقدر تدي تاسكات لأعضاء السيكتور وتتابعهم من «السيكتورات».', '/app/#/staff/sectors/' || p_sector);
  end if;
  v_new := array(select x from unnest(v_new) as x where not x = any(v_heads));
  if cardinality(v_new) > 0 then
    perform private.notify_staff_users(v_new, 'اتضفت لسيكتور ' || v_name, 'التاسكات اللي هتجيلك هتلاقيها في «تاسكاتي».', '/app/#/staff/mytasks');
  end if;
  return jsonb_build_object('ok', true, 'members', cardinality(v_ids));
end $$;
