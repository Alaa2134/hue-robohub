-- Sector meetings and the member of the month.
--   A head schedules a meeting for the sector (an overseer can also call the whole team). Everyone
--   invited is told, and reminded an hour before. At the meeting the head opens attendance: a 6-digit
--   code (also shown as a QR) that members type or scan in the app; the head can mark anyone by hand.
--   A member who can't come sends an excuse beforehand. Closing the meeting saves the minutes and marks
--   the rest absent (with a warning, if the owner turned that rule on).
--   Member of the month: a score per member from the month's tasks, meetings and warnings; the owner
--   picks the winner, the whole team is told, and an appreciation certificate can be issued.

create table public.sector_meetings (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid references public.sectors (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  agenda text not null default '' check (char_length(agenda) <= 4000),
  starts_at timestamptz not null,
  place text check (char_length(place) <= 140),
  link text check (link is null or (link ~* '^https://[^[:space:]]+$' and char_length(link) <= 300)),
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'done', 'cancelled')),
  code text check (code ~ '^[0-9]{6}$'),
  minutes text check (char_length(minutes) <= 8000),
  reminded_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sector_meetings_sector_idx on public.sector_meetings (sector_id, starts_at desc);
create index sector_meetings_upcoming_idx on public.sector_meetings (starts_at) where status = 'scheduled';
create index sector_meetings_created_by_idx on public.sector_meetings (created_by);
create trigger sector_meetings_touch before update on public.sector_meetings for each row execute function private.touch();

create table public.sector_meeting_attendance (
  meeting_id uuid not null references public.sector_meetings (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  status text not null check (status in ('present', 'late', 'excused', 'absent')),
  method text not null default 'manual' check (method in ('code', 'manual', 'excuse', 'auto')),
  note text check (char_length(note) <= 300),
  marked_at timestamptz not null default now(),
  primary key (meeting_id, staff_id)
);
create index sector_meeting_attendance_staff_idx on public.sector_meeting_attendance (staff_id);
alter table public.sector_meetings enable row level security;
alter table public.sector_meeting_attendance enable row level security;
revoke all on public.sector_meetings, public.sector_meeting_attendance from anon, authenticated;

/** Who a meeting is for: the sector's active members, or the whole active team. */
create or replace function private.meeting_invitees(p_meeting uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(s.user_id), '{}') from public.sector_meetings g
    join public.staff s on s.active
   where g.id = p_meeting
     and (g.sector_id is null or exists (select 1 from public.sector_members m where m.sector_id = g.sector_id and m.staff_id = s.user_id and m.active))
$$;

/** Runs this meeting: an overseer, or a head of its sector. */
create or replace function private.leads_meeting(p_meeting uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.sector_meetings g where g.id = p_meeting
                  and ((g.sector_id is null and private.oversees()) or (g.sector_id is not null and private.leads_sector(g.sector_id))))
$$;
revoke execute on function private.meeting_invitees(uuid), private.leads_meeting(uuid) from public, anon, authenticated;

create or replace function private.meeting_json(g public.sector_meetings, p_lead boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select (to_jsonb(g) - 'code') || jsonb_build_object(
    'code', case when p_lead and g.status = 'open' then g.code end,
    'leads', p_lead,
    'sector_name', (select name from public.sectors where id = g.sector_id),
    'sector_color', (select color from public.sectors where id = g.sector_id),
    'invited', cardinality(private.meeting_invitees(g.id)),
    'present', (select count(*) from public.sector_meeting_attendance x where x.meeting_id = g.id and x.status in ('present', 'late')),
    'mine', (select to_jsonb(x) from public.sector_meeting_attendance x where x.meeting_id = g.id and x.staff_id = auth.uid()),
    'attendance', case when p_lead then coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', u, 'name', private.staff_name(u), 'status', x.status, 'method', x.method, 'note', x.note, 'marked_at', x.marked_at)
                       order by private.staff_name(u))
        from unnest(private.meeting_invitees(g.id)) as u
        left join public.sector_meeting_attendance x on x.meeting_id = g.id and x.staff_id = u), '[]'::jsonb) end)
$$;
revoke execute on function private.meeting_json(public.sector_meetings, boolean) from public, anon, authenticated;

/** Meetings I'm invited to or run (a sector's, or all for an overseer): upcoming and the last 60 days. */
create or replace function public.staff_meetings(p_sector uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.meeting_json(g, private.leads_meeting(g.id)) order by g.starts_at desc)
      from public.sector_meetings g
     where g.starts_at > now() - interval '60 days'
       and (p_sector is null or g.sector_id = p_sector)
       and (auth.uid() = any(private.meeting_invitees(g.id)) or private.leads_meeting(g.id))), '[]'::jsonb);
end $$;

create or replace function public.staff_meeting(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
  v_lead boolean;
begin
  select * into g from public.sector_meetings where id = p_id;
  if g.id is null or not private.is_staff() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_lead := private.leads_meeting(p_id);
  if not v_lead and not auth.uid() = any(private.meeting_invitees(p_id)) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return private.meeting_json(g, v_lead);
end $$;

/** Heads (their sector) and overseers (any sector, or the whole team): schedule or edit a meeting. */
create or replace function public.staff_meeting_save(p_id uuid, p_sector uuid, p_title text, p_agenda text, p_starts timestamptz, p_place text, p_link text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_sector uuid := p_sector;
  v_new boolean := p_id is null;
begin
  if p_id is not null then
    select sector_id into v_sector from public.sector_meetings where id = p_id and status in ('scheduled', 'open');
    if not private.leads_meeting(p_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif (v_sector is null and not private.oversees()) or (v_sector is not null and not private.leads_sector(v_sector)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_starts is null or (v_new and p_starts < now() - interval '1 hour') then
    raise exception 'bad_time' using errcode = '22023';
  end if;
  if v_new then
    insert into public.sector_meetings (sector_id, title, agenda, starts_at, place, link)
    values (v_sector, btrim(p_title), coalesce(btrim(p_agenda), ''), p_starts, nullif(btrim(p_place), ''), nullif(btrim(p_link), ''))
    returning id into v_id;
  else
    update public.sector_meetings set title = btrim(p_title), agenda = coalesce(btrim(p_agenda), ''), place = nullif(btrim(p_place), ''),
           link = nullif(btrim(p_link), ''), reminded_at = case when starts_at <> p_starts then null else reminded_at end, starts_at = p_starts
     where id = p_id and status in ('scheduled', 'open') returning id into v_id;
    if v_id is null then
      raise exception 'closed' using errcode = '22023';
    end if;
  end if;
  perform private.notify_staff_users(array_remove(private.meeting_invitees(v_id), auth.uid()),
    case when v_new then '📅 اجتماع: ' else '📅 اتغيّر اجتماع: ' end || btrim(p_title),
    to_char(p_starts at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || coalesce(' · ' || nullif(btrim(p_place), ''), ''),
    '/app/#/staff/meetings/' || v_id);
  return v_id;
end $$;

/** Heads: open attendance (a fresh 6-digit code). */
create or replace function public.staff_meeting_open(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not private.leads_meeting(p_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.sector_meetings set status = 'open', code = v_code where id = p_id and status in ('scheduled', 'open');
  if not found then
    raise exception 'closed' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

/** A member checks in with the code (late after 15 minutes). */
create or replace function public.staff_meeting_checkin(p_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.throttle('meeting_code', 20, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into g from public.sector_meetings where id = p_id;
  if g.id is null or not auth.uid() = any(private.meeting_invitees(p_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_invited');
  end if;
  if g.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  if g.code is distinct from btrim(p_code) then
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;
  v_status := case when now() > g.starts_at + interval '15 minutes' then 'late' else 'present' end;
  insert into public.sector_meeting_attendance (meeting_id, staff_id, status, method) values (p_id, auth.uid(), v_status, 'code')
  on conflict (meeting_id, staff_id) do update set status = excluded.status, method = 'code', marked_at = now();
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

/** A member who can't come says why (before the meeting closes). The heads are told. */
create or replace function public.staff_meeting_excuse(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
begin
  select * into g from public.sector_meetings where id = p_id and status in ('scheduled', 'open');
  if g.id is null or not private.is_staff() or not auth.uid() = any(private.meeting_invitees(p_id)) or coalesce(char_length(btrim(p_reason)), 0) < 2 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.sector_meeting_attendance (meeting_id, staff_id, status, method, note) values (p_id, auth.uid(), 'excused', 'excuse', left(btrim(p_reason), 300))
  on conflict (meeting_id, staff_id) do update set status = 'excused', method = 'excuse', note = excluded.note, marked_at = now();
  perform private.notify_staff_users(case when g.sector_id is null then private.overseer_ids() else private.sector_heads(g.sector_id) end,
    private.staff_name(auth.uid()) || ' معتذر عن: ' || g.title, left(btrim(p_reason), 200), '/app/#/staff/meetings/' || p_id);
  return jsonb_build_object('ok', true);
end $$;

/** Heads: mark someone by hand. */
create or replace function public.staff_meeting_mark(p_id uuid, p_staff uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.leads_meeting(p_id) or not p_staff = any(private.meeting_invitees(p_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.sector_meeting_attendance (meeting_id, staff_id, status, method) values (p_id, p_staff, p_status, 'manual')
  on conflict (meeting_id, staff_id) do update set status = excluded.status, method = 'manual', marked_at = now();
  return jsonb_build_object('ok', true);
end $$;

/** Heads: close the meeting with its minutes. Whoever didn't come or excuse themselves is absent. */
create or replace function public.staff_meeting_close(p_id uuid, p_minutes text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
  v_absent uuid[];
begin
  if not private.leads_meeting(p_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.sector_meetings set status = 'done', code = null, minutes = nullif(left(btrim(p_minutes), 8000), ''), closed_at = now()
   where id = p_id and status in ('scheduled', 'open')
  returning * into g;
  if g.id is null then
    raise exception 'closed' using errcode = '22023';
  end if;
  v_absent := array(select u from unnest(private.meeting_invitees(p_id)) as u
                     where not exists (select 1 from public.sector_meeting_attendance x where x.meeting_id = p_id and x.staff_id = u));
  insert into public.sector_meeting_attendance (meeting_id, staff_id, status, method) select p_id, u, 'absent', 'auto' from unnest(v_absent) as u;
  if (private.team_rules()).meeting_absence_warn then
    insert into public.staff_warnings (staff_id, sector_id, kind, reason, issued_by)
    select u, g.sector_id, 'manual', 'غياب عن اجتماع «' || left(g.title, 140) || '» من غير عذر (' || to_char(g.starts_at at time zone 'Africa/Cairo', 'DD/MM') || ').', auth.uid()
      from unnest(v_absent) as u where not exists (select 1 from public.staff s where s.user_id = u and s.role = 'owner');
  end if;
  perform private.notify_staff_users(array_remove(private.meeting_invitees(p_id), auth.uid()), '📝 محضر: ' || g.title,
    coalesce(left(nullif(btrim(p_minutes), ''), 200), 'الاجتماع خلص.'), '/app/#/staff/meetings/' || p_id);
  return jsonb_build_object('ok', true, 'absent', cardinality(v_absent));
end $$;

create or replace function public.staff_meeting_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
begin
  if not private.leads_meeting(p_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.sector_meetings set status = 'cancelled', code = null where id = p_id and status in ('scheduled', 'open') returning * into g;
  if g.id is not null then
    perform private.notify_staff_users(array_remove(private.meeting_invitees(p_id), auth.uid()), '❌ اتلغى اجتماع: ' || g.title,
      to_char(g.starts_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), '/app/#/staff/meetings/' || p_id);
  end if;
  return jsonb_build_object('ok', g.id is not null);
end $$;

/** Every 10 minutes (with the task sweep): an hour-before reminder for each meeting. */
create or replace function private.meeting_reminders() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.sector_meetings;
begin
  for g in
    update public.sector_meetings set reminded_at = now()
     where status = 'scheduled' and reminded_at is null and starts_at between now() and now() + interval '1 hour'
    returning *
  loop
    perform private.notify_staff_users(array(select u from unnest(private.meeting_invitees(g.id)) as u
                                              where not exists (select 1 from public.sector_meeting_attendance x where x.meeting_id = g.id and x.staff_id = u and x.status = 'excused')),
      '⏰ اجتماع كمان شوية: ' || g.title, to_char(g.starts_at at time zone 'Africa/Cairo', 'HH24:MI') || coalesce(' · ' || g.place, ''), '/app/#/staff/meetings/' || g.id);
  end loop;
end $$;
revoke execute on function private.meeting_reminders() from public, anon, authenticated;
select private.patch_function('private.staff_task_sweep()',
  $p$  perform private.staff_task_repeat();
$p$,
  $p$  perform private.staff_task_repeat();
  perform private.meeting_reminders();
$p$);

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_meetings(uuid)',
    'public.staff_meeting(uuid)',
    'public.staff_meeting_save(uuid, uuid, text, text, timestamptz, text, text)',
    'public.staff_meeting_open(uuid)',
    'public.staff_meeting_checkin(uuid, text)',
    'public.staff_meeting_excuse(uuid, text)',
    'public.staff_meeting_mark(uuid, uuid, text)',
    'public.staff_meeting_close(uuid, text)',
    'public.staff_meeting_cancel(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
