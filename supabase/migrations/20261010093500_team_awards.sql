-- Member of the month (see 20261010093000_meetings.sql for the meetings that count towards it).

-- ─────────────────────────────────────────────────────────── member of the month
create table public.team_awards (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  note text check (char_length(note) <= 300),
  certificate_id uuid references public.certificates (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index team_awards_staff_idx on public.team_awards (staff_id);
create index team_awards_certificate_idx on public.team_awards (certificate_id);
create index team_awards_created_by_idx on public.team_awards (created_by);
alter table public.team_awards enable row level security;
revoke all on public.team_awards from anon, authenticated;

/** Overseers: each member's score for a month (tasks on time ×3, approved ×2, meetings ×1, late ×1;
    missed −3, absent −2, warnings −4) and the month's award if already given. */
create or replace function public.staff_month_scores(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Cairo')::date))::date;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_from := v_month::timestamp at time zone 'Africa/Cairo';
  v_to := (v_month + interval '1 month')::timestamp at time zone 'Africa/Cairo';
  return jsonb_build_object(
    'month', v_month,
    'award', (select to_jsonb(a) || jsonb_build_object('name', private.staff_name(a.staff_id)) from public.team_awards a where a.month = v_month),
    'people', coalesce((select jsonb_agg(p order by (p ->> 'score')::int desc, p ->> 'name') from (
      select jsonb_build_object('staff_id', s.user_id, 'name', private.staff_name(s.user_id), 'title', s.title,
               'on_time', x.on_time, 'late', x.late, 'approved', x.approved, 'missed', x.missed,
               'present', y.present, 'absent', y.absent, 'warnings', z.warnings,
               'score', 3 * x.on_time + 2 * x.approved + x.late + y.present - 3 * x.missed - 2 * y.absent - 4 * z.warnings) as p
        from public.staff s
        cross join lateral (select count(*) filter (where a.submitted_at >= v_from and a.submitted_at < v_to and not a.late) as on_time,
                                   count(*) filter (where a.submitted_at >= v_from and a.submitted_at < v_to and a.late) as late,
                                   count(*) filter (where a.state = 'approved' and not a.excused and a.reviewed_at >= v_from and a.reviewed_at < v_to) as approved,
                                   count(*) filter (where a.missed_at >= v_from and a.missed_at < v_to) as missed
                              from public.staff_task_assignees a where a.staff_id = s.user_id) x
        cross join lateral (select count(*) filter (where t.status in ('present', 'late')) as present, count(*) filter (where t.status = 'absent') as absent
                              from public.sector_meeting_attendance t join public.sector_meetings g on g.id = t.meeting_id
                             where t.staff_id = s.user_id and g.starts_at >= v_from and g.starts_at < v_to) y
        cross join lateral (select count(*) as warnings from public.staff_warnings w
                             where w.staff_id = s.user_id and w.cancelled_at is null and w.created_at >= v_from and w.created_at < v_to) z
       where s.active and s.role <> 'owner') q), '[]'::jsonb));
end $$;

/** Overseers: name the member of the month; the team is told; optionally an appreciation certificate. */
create or replace function public.staff_award_month(p_month date, p_staff uuid, p_note text, p_certificate boolean default true) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_name text := private.staff_name(p_staff);
  v_cert uuid;
  v_label text;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff where user_id = p_staff and active) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_awards where month = v_month) then
    raise exception 'already' using errcode = '22023';
  end if;
  v_label := to_char(v_month, 'MM/YYYY');
  if p_certificate then
    insert into public.certificates (recipient_name, kind, title, title_ar, details, details_ar)
    values ((select coalesce(nullif(btrim(full_name), ''), v_name) from public.staff where user_id = p_staff), 'appreciation',
            'Member of the Month', 'عضو الشهر', 'BuildX HUE · ' || v_label, 'فريق BuildX HUE · شهر ' || v_label)
    returning id into v_cert;
  end if;
  insert into public.team_awards (month, staff_id, note, certificate_id) values (v_month, p_staff, nullif(left(btrim(p_note), 300), ''), v_cert);
  perform private.notify_staff_users(array(select user_id from public.staff where active), '🏆 عضو الشهر: ' || v_name,
    coalesce(nullif(left(btrim(p_note), 200), ''), 'مبروك! شغل محترم الشهر ده 👏'), '/app/#/staff');
  return jsonb_build_object('ok', true, 'certificate_id', v_cert);
end $$;

/** The latest member of the month (for everyone's home screen). */
create or replace function public.staff_award_latest() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select jsonb_build_object('month', a.month, 'staff_id', a.staff_id, 'name', private.staff_name(a.staff_id), 'note', a.note)
            from public.team_awards a where a.month >= date_trunc('month', now() - interval '45 days') order by a.month desc limit 1);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_month_scores(date)',
    'public.staff_award_month(date, uuid, text, boolean)',
    'public.staff_award_latest()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
