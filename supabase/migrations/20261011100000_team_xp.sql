-- Points (XP), levels and badges for the team, worked out from what people already do: handing tasks
-- in on time, getting them approved, coming to meetings, returning what they borrow, being named
-- member of the month — and losing some for missed deadlines, absences and warnings. Nothing to
-- enter by hand. A level up or a new badge sends a notification (from the 10-minute team sweep).

create table public.staff_xp_state (
  staff_id uuid primary key references public.staff (user_id) on delete cascade,
  xp int not null default 0,
  level int not null default 1,
  badges text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.staff_xp_state enable row level security;
revoke all on public.staff_xp_state from anon, authenticated;

/** The level for an amount of XP: 1–10 with its name, where it started and where the next one starts. */
create or replace function private.xp_level(p_xp int) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('level', l.n, 'name', l.name, 'from', l.at, 'next', (select min(x.at) from (values (100), (250), (450), (700), (1000), (1400), (1900), (2500), (3200)) as x(at) where x.at > p_xp))
    from (values (1, 'ترس صغير', 0), (2, 'مسمار شاطر', 100), (3, 'دايرة كهربا', 250), (4, 'حساس ذكي', 450), (5, 'موتور شغّال', 700),
                 (6, 'روبوت ناشئ', 1000), (7, 'روبوت محترف', 1400), (8, 'مهندس الفريق', 1900), (9, 'عبقري BuildX', 2500), (10, 'أسطورة BuildX', 3200)) as l(n, name, at)
   where l.at <= greatest(p_xp, 0)
   order by l.n desc limit 1
$$;
revoke execute on function private.xp_level(int) from public, anon, authenticated;

/** Everything one team member earned (since a date, or ever): XP with its parts, the stats behind it and the badges. */
create or replace function private.staff_xp_calc(p_staff uuid, p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_on_time int; v_late int; v_approved int; v_missed int;
  v_present int; v_m_late int; v_absent int;
  v_warnings int; v_awards int; v_back int; v_back_late int;
  v_streak int; v_clean boolean; v_tasks int; v_meet int; v_store int; v_xp int;
  v_badges text[] := '{}';
begin
  select count(*) filter (where a.submitted_at >= v_since and not a.late),
         count(*) filter (where a.submitted_at >= v_since and a.late),
         count(*) filter (where a.state = 'approved' and coalesce(a.reviewed_at, a.submitted_at) >= v_since),
         count(*) filter (where a.missed_at >= v_since and a.submitted_at is null and not a.excused)
    into v_on_time, v_late, v_approved, v_missed
    from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id and t.status <> 'cancelled'
   where a.staff_id = p_staff;
  select count(*) filter (where x.status = 'present'), count(*) filter (where x.status = 'late'), count(*) filter (where x.status = 'absent')
    into v_present, v_m_late, v_absent
    from public.sector_meeting_attendance x join public.sector_meetings g on g.id = x.meeting_id and g.status <> 'cancelled'
   where x.staff_id = p_staff and g.starts_at >= v_since;
  select count(*) into v_warnings from public.staff_warnings w where w.staff_id = p_staff and w.cancelled_at is null and w.created_at >= v_since;
  select count(*) into v_awards from public.team_awards w where w.staff_id = p_staff and w.created_at >= v_since;
  select count(*) filter (where l.due_at is null or l.returned_at <= l.due_at), count(*) filter (where l.returned_at > l.due_at)
    into v_back, v_back_late
    from public.inventory_loans l where l.staff_id = p_staff and l.status = 'returned' and l.returned_at >= v_since;

  -- The longest run of hand-ins on time (a late one or a missed deadline breaks it).
  select coalesce(max(n), 0) into v_streak from (
    select count(*) filter (where ok) as n from (
      select ok, count(*) filter (where not ok) over (order by at) as grp from (
        select a.submitted_at as at, not a.late as ok from public.staff_task_assignees a where a.staff_id = p_staff and a.submitted_at is not null
        union all
        select a.missed_at, false from public.staff_task_assignees a where a.staff_id = p_staff and a.missed_at is not null and a.submitted_at is null and not a.excused
      ) e) r group by grp) s;
  v_clean := (select created_at < now() - interval '90 days' from public.staff where user_id = p_staff)
             and not exists (select 1 from public.staff_warnings w where w.staff_id = p_staff and w.cancelled_at is null and w.created_at > now() - interval '90 days');

  v_tasks := v_on_time * 30 + v_late * 10 + v_approved * 15 - v_missed * 20;
  v_meet := v_present * 15 + v_m_late * 5 - v_absent * 10;
  v_store := v_back * 5 - v_back_late * 5;
  v_xp := greatest(0, v_tasks + v_meet + v_store + v_awards * 200 - v_warnings * 40);

  if p_since is null then
    if v_on_time + v_late > 0 then v_badges := array_append(v_badges, 'first_task'); end if;
    if v_on_time >= 10 then v_badges := array_append(v_badges, 'on_time_10'); end if;
    if v_streak >= 5 then v_badges := array_append(v_badges, 'streak_5'); end if;
    if v_approved >= 25 then v_badges := array_append(v_badges, 'approved_25'); end if;
    if v_present + v_m_late >= 10 then v_badges := array_append(v_badges, 'meetings_10'); end if;
    if v_awards > 0 then v_badges := array_append(v_badges, 'member_of_month'); end if;
    if v_clean then v_badges := array_append(v_badges, 'clean_90'); end if;
    if v_back >= 5 then v_badges := array_append(v_badges, 'store_trust'); end if;
  end if;

  return jsonb_build_object(
    'xp', v_xp, 'level', private.xp_level(v_xp),
    'parts', jsonb_build_object('tasks', v_tasks, 'meetings', v_meet, 'store', v_store, 'awards', v_awards * 200, 'warnings', -v_warnings * 40),
    'stats', jsonb_build_object('on_time', v_on_time, 'late', v_late, 'approved', v_approved, 'missed', v_missed, 'present', v_present,
                                'meeting_late', v_m_late, 'absent', v_absent, 'warnings', v_warnings, 'awards', v_awards, 'returned', v_back, 'streak', v_streak),
    'badges', to_jsonb(v_badges));
end $$;
revoke execute on function private.staff_xp_calc(uuid, timestamptz) from public, anon, authenticated;

/** My XP (or a teammate's: the parts and stats only for myself, an overseer, or a head of their sector). */
create or replace function public.staff_xp(p_staff uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_staff, auth.uid());
  v_all jsonb;
  v_full boolean;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff where user_id = v_id and active) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_full := v_id = auth.uid() or private.oversees()
            or exists (select 1 from public.sector_members h join public.sector_members m on m.sector_id = h.sector_id and m.staff_id = v_id and m.active
                        where h.staff_id = auth.uid() and h.is_head and h.active);
  v_all := private.staff_xp_calc(v_id);
  return jsonb_build_object('staff_id', v_id, 'name', private.staff_name(v_id), 'xp', v_all -> 'xp', 'level', v_all -> 'level', 'badges', v_all -> 'badges',
           'month', (private.staff_xp_calc(v_id, date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') -> 'xp'),
           'parts', case when v_full then v_all -> 'parts' end, 'stats', case when v_full then v_all -> 'stats' end,
           'rank', (select count(*) + 1 from public.staff_xp_state s join public.staff st on st.user_id = s.staff_id and st.active where s.xp > (v_all ->> 'xp')::int));
end $$;

/** The team's table: everyone (or one sector) with XP, this month's XP, level and badge count. */
create or replace function public.staff_xp_board(p_sector uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by (x ->> 'xp')::int desc, x ->> 'name')
      from (select jsonb_build_object('staff_id', s.user_id, 'name', private.staff_name(s.user_id), 'title', s.title,
                     'xp', (c.v ->> 'xp')::int, 'level', c.v -> 'level', 'badges', c.v -> 'badges',
                     'month', (private.staff_xp_calc(s.user_id, v_month) ->> 'xp')::int, 'me', s.user_id = auth.uid()) as x
              from public.staff s
              cross join lateral (select private.staff_xp_calc(s.user_id) as v) c
             where s.active
               and (p_sector is null or exists (select 1 from public.sector_members m where m.sector_id = p_sector and m.staff_id = s.user_id and m.active))) q), '[]'::jsonb);
end $$;

/** From the 10-minute sweep: keep everyone's XP, and tell them when they level up or earn a badge. */
create or replace function private.xp_sweep() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  v jsonb;
  v_old public.staff_xp_state;
  v_level int;
  v_new text[];
  v_names constant jsonb := '{"first_task":"أول تسليم","on_time_10":"10 في الميعاد","streak_5":"5 ورا بعض في الميعاد","approved_25":"25 تاسك اتقبلوا","meetings_10":"10 اجتماعات","member_of_month":"عضو الشهر","clean_90":"90 يوم من غير إنذار","store_trust":"أمين على العُهدة"}';
begin
  for s in select user_id from public.staff where active loop
    v := private.staff_xp_calc(s.user_id);
    v_level := (v -> 'level' ->> 'level')::int;
    select * into v_old from public.staff_xp_state where staff_id = s.user_id;
    if v_old.staff_id is null then
      insert into public.staff_xp_state (staff_id, xp, level, badges) values (s.user_id, (v ->> 'xp')::int, v_level, array(select jsonb_array_elements_text(v -> 'badges')));
      continue;
    end if;
    v_new := array(select b from jsonb_array_elements_text(v -> 'badges') b where not b = any(v_old.badges));
    if v_level > v_old.level then
      perform private.notify_staff_users(array[s.user_id], '🎉 طلعت ليفل ' || v_level || ': ' || (v -> 'level' ->> 'name'),
        'معاك ' || (v ->> 'xp') || ' نقطة. كمّل كده!', '/app/#/staff/xp');
    end if;
    if cardinality(v_new) > 0 then
      perform private.notify_staff_users(array[s.user_id], '🏅 وسام جديد: ' || (select string_agg(coalesce(v_names ->> b, b), '، ') from unnest(v_new) b),
        'شوف أوسمتك ومستواك.', '/app/#/staff/xp');
    end if;
    if (v ->> 'xp')::int <> v_old.xp or v_level <> v_old.level or cardinality(v_new) > 0 then
      update public.staff_xp_state set xp = (v ->> 'xp')::int, level = greatest(v_level, v_old.level), badges = v_old.badges || v_new, updated_at = now()
       where staff_id = s.user_id;
    end if;
  end loop;
end $$;
revoke execute on function private.xp_sweep() from public, anon, authenticated;
select private.patch_function('private.staff_task_sweep()',
  $p$  perform private.inventory_sweep();
$p$,
  $p$  perform private.inventory_sweep();
  perform private.xp_sweep();
$p$);

revoke execute on function public.staff_xp(uuid), public.staff_xp_board(uuid) from public, anon;
grant execute on function public.staff_xp(uuid), public.staff_xp_board(uuid) to authenticated;
