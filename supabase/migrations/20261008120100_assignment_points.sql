-- Graded tasks count towards points (each up to 20, like quizzes).

-- ─────────────────────────────────────────────────────────────── points: graded tasks count too
-- A new function (the result gains a column); private.points_table() is no longer used.
create or replace function private.student_scores() returns table (
  student_id uuid, name text, group_name text,
  attended int, quizzes int, perfect int, certs int, events int, bonus int, tasks int, points int
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
  ), t as (
    select s.student_id, count(*) as tasks, sum(round(least(s.grade / a.max_points, 1) * 20)) as pts
      from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id
     where s.grade is not null group by s.student_id
  )
  select s.id, s.full_name, s.group_name,
         coalesce(a.attended, 0)::int, coalesce(q.quizzes, 0)::int, coalesce(q.perfect, 0)::int, coalesce(c.certs, 0)::int,
         coalesce(e.events, 0)::int, coalesce(b.bonus, 0)::int, coalesce(t.tasks, 0)::int,
         greatest(0, coalesce(a.pts, 0) + coalesce(q.pts, 0) + coalesce(c.certs, 0) * 30 + coalesce(e.events, 0) * 15 + coalesce(b.bonus, 0) + coalesce(t.pts, 0))::int
    from public.students s
    left join a on a.student_id = s.id left join q on q.student_id = s.id left join c on c.student_id = s.id
    left join e on e.student_id = s.id left join b on b.student_id = s.id left join t on t.student_id = s.id
   where s.active
$$;
revoke execute on function private.student_scores() from public, anon, authenticated;

create or replace function public.student_points(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_out jsonb;
begin
  with p as (select * from private.student_scores()),
       me as (select * from p where student_id = v_id),
       grp as (select p.* from p, me where p.group_name = me.group_name)
  select jsonb_build_object(
    'points', me.points,
    'rank', (select count(*) + 1 from grp where grp.points > me.points),
    'of', (select count(*) from grp),
    'group', me.group_name,
    'breakdown', jsonb_build_object('attended', me.attended, 'quizzes', me.quizzes, 'perfect', me.perfect, 'certs', me.certs, 'events', me.events, 'bonus', me.bonus, 'tasks', me.tasks),
    'badges', to_jsonb(private.badges(me.attended, me.quizzes, me.perfect, me.certs, me.events, me.bonus)),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', split_part(t.name, ' ', 1) || coalesce(' ' || left(nullif(split_part(t.name, ' ', 2), ''), 1) || '.', ''), 'points', t.points, 'me', t.student_id = v_id) order by t.points desc, t.name)
        from (select * from grp order by points desc, name limit 10) t
    ), '[]'::jsonb)
  ) into v_out
  from me;
  return coalesce(v_out, jsonb_build_object('points', 0, 'badges', '[]'::jsonb, 'top', '[]'::jsonb));
end $$;

create or replace function public.staff_leaderboard(p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.student_id, 'name', t.name, 'group', t.group_name, 'points', t.points,
      'attended', t.attended, 'quizzes', t.quizzes, 'perfect', t.perfect, 'certs', t.certs, 'events', t.events, 'bonus', t.bonus, 'tasks', t.tasks,
      'badges', to_jsonb(private.badges(t.attended, t.quizzes, t.perfect, t.certs, t.events, t.bonus))) order by t.points desc, t.name)
      from private.student_scores() t
     where p_group is null or p_group = '' or t.group_name = p_group
  ), '[]'::jsonb);
end $$;
