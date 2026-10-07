-- Points, badges and a leaderboard for students, computed from what they already do:
--   attended session 10 (late 6) · each quiz up to 20 (best attempt) · certificate 30 ·
--   event checked in at 15 (matched by phone) · bonus points staff give by hand.

create table public.student_bonus (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  points int not null check (points between -100 and 100 and points <> 0),
  reason text not null check (char_length(btrim(reason)) between 2 and 140),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index student_bonus_student_idx on public.student_bonus (student_id);
create index student_bonus_created_by_idx on public.student_bonus (created_by);
alter table public.student_bonus enable row level security;
create policy student_bonus_select on public.student_bonus for select to authenticated using ((select private.is_staff()));
create policy student_bonus_insert on public.student_bonus for insert to authenticated with check ((select private.is_staff()));
grant select, insert on public.student_bonus to authenticated;
revoke all on public.student_bonus from anon;
create trigger student_bonus_audit after insert on public.student_bonus for each row execute function private.audit();

create or replace function private.points_table() returns table (
  student_id uuid, name text, group_name text,
  attended int, quizzes int, perfect int, certs int, events int, bonus int, points int
)
language sql stable security definer set search_path = ''
as $$
  with a as (
    select student_id, count(*) filter (where status in ('present', 'late')) as attended,
           sum(case status when 'present' then 10 when 'late' then 6 else 0 end) as pts
      from public.attendance group by student_id
  ), q as (
    select student_id, count(*) as quizzes, count(*) filter (where best >= 1) as perfect, sum(round(best * 20)) as pts
      from (
        select student_id, quiz_id, max(case when max_score > 0 then least(score / max_score, 1) else 0 end) as best
          from public.quiz_attempts where submitted_at is not null and score is not null group by student_id, quiz_id
      ) b group by student_id
  ), c as (
    select student_id, count(*) as certs from public.certificates where student_id is not null and revoked_at is null group by student_id
  ), e as (
    select s.id as student_id, count(distinct r.event_id) as events
      from public.students s join public.event_registrations r on r.phone = private.norm_phone(s.phone) and r.checked_in_at is not null
     where s.phone is not null group by s.id
  ), b as (
    select student_id, sum(points) as bonus from public.student_bonus group by student_id
  )
  select s.id, s.full_name, s.group_name,
         coalesce(a.attended, 0)::int, coalesce(q.quizzes, 0)::int, coalesce(q.perfect, 0)::int, coalesce(c.certs, 0)::int,
         coalesce(e.events, 0)::int, coalesce(b.bonus, 0)::int,
         greatest(0, coalesce(a.pts, 0) + coalesce(q.pts, 0) + coalesce(c.certs, 0) * 30 + coalesce(e.events, 0) * 15 + coalesce(b.bonus, 0))::int
    from public.students s
    left join a on a.student_id = s.id left join q on q.student_id = s.id left join c on c.student_id = s.id
    left join e on e.student_id = s.id left join b on b.student_id = s.id
   where s.active
$$;

create or replace function private.badges(attended int, quizzes int, perfect int, certs int, events int, bonus int) returns text[]
language sql immutable set search_path = ''
as $$
  select array_remove(array[
    case when attended >= 1 then 'first_step' end,
    case when attended >= 10 then 'regular' end,
    case when attended >= 25 then 'iron' end,
    case when quizzes >= 5 then 'quiz_runner' end,
    case when perfect >= 1 then 'full_marks' end,
    case when perfect >= 5 then 'genius' end,
    case when certs >= 1 then 'certified' end,
    case when events >= 3 then 'social' end,
    case when bonus >= 50 then 'team_star' end
  ], null)
$$;

/** The signed-in student's points, badges and their group's top 10 (first name + initial only). */
create or replace function public.student_points(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_out jsonb;
begin
  with p as (select * from private.points_table()),
       me as (select * from p where student_id = v_id),
       grp as (select p.* from p, me where p.group_name = me.group_name)
  select jsonb_build_object(
    'points', me.points,
    'rank', (select count(*) + 1 from grp where grp.points > me.points),
    'of', (select count(*) from grp),
    'group', me.group_name,
    'breakdown', jsonb_build_object('attended', me.attended, 'quizzes', me.quizzes, 'perfect', me.perfect, 'certs', me.certs, 'events', me.events, 'bonus', me.bonus),
    'badges', to_jsonb(private.badges(me.attended, me.quizzes, me.perfect, me.certs, me.events, me.bonus)),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', split_part(t.name, ' ', 1) || coalesce(' ' || left(nullif(split_part(t.name, ' ', 2), ''), 1) || '.', ''), 'points', t.points, 'me', t.student_id = v_id) order by t.points desc, t.name)
        from (select * from grp order by points desc, name limit 10) t
    ), '[]'::jsonb)
  ) into v_out
  from me;
  return coalesce(v_out, jsonb_build_object('points', 0, 'badges', '[]'::jsonb, 'top', '[]'::jsonb));
end $$;

/** Full leaderboard for staff, optionally one group. */
create or replace function public.staff_leaderboard(p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.student_id, 'name', t.name, 'group', t.group_name, 'points', t.points,
      'attended', t.attended, 'quizzes', t.quizzes, 'perfect', t.perfect, 'certs', t.certs, 'events', t.events, 'bonus', t.bonus,
      'badges', to_jsonb(private.badges(t.attended, t.quizzes, t.perfect, t.certs, t.events, t.bonus))) order by t.points desc, t.name)
      from private.points_table() t
     where p_group is null or p_group = '' or t.group_name = p_group
  ), '[]'::jsonb);
end $$;

revoke execute on function private.points_table(), private.badges(int, int, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.student_points(text), public.staff_leaderboard(text) from public;
grant execute on function public.student_points(text) to anon, authenticated;
grant execute on function public.staff_leaderboard(text) to authenticated;
