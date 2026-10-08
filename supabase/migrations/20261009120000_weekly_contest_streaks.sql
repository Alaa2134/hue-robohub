-- Weekly quiz contest and attendance streaks.
--   A coach marks a quiz "كويز الأسبوع". Each student's first attempt counts: best score, then the
--   fastest. When the quiz closes (or a week after it opened, without a closing time) the top three
--   get bonus points (30 / 20 / 10) and the group hears who won.
--   A streak is the number of the group's sessions in a row a student attended (present or late);
--   five in a row earns the "on fire" badge.

alter table public.quizzes add column if not exists weekly boolean not null default false;
alter table public.quizzes add column if not exists weekly_awarded_at timestamptz;

/** The contest table for one quiz: first attempts, best score then fastest. */
create or replace function private.contest_rank(p_quiz uuid) returns table (student_id uuid, name text, score numeric, max_score numeric, seconds int, rank int)
language sql stable security definer set search_path = ''
as $$
  select f.student_id, s.full_name, f.score, f.max_score, f.seconds,
         (row_number() over (order by case when f.max_score > 0 then f.score / f.max_score else 0 end desc, f.seconds asc, f.submitted_at asc))::int
    from (
      select distinct on (a.student_id) a.student_id, a.score, a.max_score, a.submitted_at,
             greatest(0, extract(epoch from a.submitted_at - a.started_at))::int as seconds
        from public.quiz_attempts a
       where a.quiz_id = p_quiz and a.submitted_at is not null and a.score is not null
       order by a.student_id, a.started_at
    ) f
    join public.students s on s.id = f.student_id and s.active
$$;
revoke execute on function private.contest_rank(uuid) from public, anon, authenticated;

/** "Mona A." */
create or replace function private.short_name(p text) returns text
language sql immutable set search_path = ''
as $$
  select split_part(p, ' ', 1) || coalesce(' ' || left(nullif(split_part(p, ' ', 2), ''), 1) || '.', '')
$$;

/** Student: this week's contest for their group (the latest one from the last 14 days). */
create or replace function public.student_weekly(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
  v_quiz public.quizzes%rowtype;
  v_ends timestamptz;
begin
  select group_name into v_group from public.students where id = v_id;
  select * into v_quiz from public.quizzes q
   where q.weekly and q.published and (q.group_name = '' or q.group_name = v_group)
     and coalesce(q.opens_at, q.created_at) > now() - interval '14 days'
   order by coalesce(q.opens_at, q.created_at) desc limit 1;
  if v_quiz.id is null then
    return null;
  end if;
  v_ends := coalesce(v_quiz.closes_at, coalesce(v_quiz.opens_at, v_quiz.created_at) + interval '7 days');
  return jsonb_build_object(
    'quiz', jsonb_build_object('id', v_quiz.id, 'title', v_quiz.title, 'opensAt', v_quiz.opens_at, 'endsAt', v_ends,
      'state', case when v_quiz.opens_at > now() then 'upcoming' when v_ends <= now() then 'done' else 'open' end),
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', private.short_name(r.name), 'score', r.score, 'max', r.max_score, 'seconds', r.seconds, 'me', r.student_id = v_id) order by r.rank)
                       from private.contest_rank(v_quiz.id) r where r.rank <= 5), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', r.rank, 'score', r.score, 'max', r.max_score) from private.contest_rank(v_quiz.id) r where r.student_id = v_id),
    'players', (select count(*) from private.contest_rank(v_quiz.id)));
end $$;
revoke execute on function public.student_weekly(text) from public;
grant execute on function public.student_weekly(text) to anon, authenticated;

/** Staff: the contest table for a quiz (full names). */
create or replace function public.staff_contest(p_quiz uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can('content') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', r.name, 'score', r.score, 'max', r.max_score, 'seconds', r.seconds) order by r.rank)
                     from private.contest_rank(p_quiz) r), '[]'::jsonb);
end $$;
revoke execute on function public.staff_contest(uuid) from public, anon;
grant execute on function public.staff_contest(uuid) to authenticated;

-- When a contest ends: bonus points for the top three, once, and the group hears who won.
create or replace function private.award_weekly() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  r record;
  v_names text;
begin
  for q in
    update public.quizzes set weekly_awarded_at = now()
     where weekly and published and weekly_awarded_at is null
       and coalesce(closes_at, coalesce(opens_at, created_at) + interval '7 days') <= now()
    returning id, title, group_name
  loop
    v_names := null;
    for r in select * from private.contest_rank(q.id) where rank <= 3 order by rank loop
      insert into public.student_bonus (student_id, points, reason, created_by)
      values (r.student_id, case r.rank when 1 then 30 when 2 then 20 else 10 end,
              left('مسابقة الأسبوع: المركز ' || r.rank || ' في ' || q.title, 140), null);
      v_names := coalesce(v_names || ' · ', '') || case r.rank when 1 then '🥇 ' when 2 then '🥈 ' else '🥉 ' end || private.short_name(r.name);
    end loop;
    if v_names is not null then
      perform private.notify_students(q.group_name, 'contest', 'أبطال مسابقة الأسبوع 🏆', v_names, '/app/#/me');
    end if;
  end loop;
end $$;
revoke execute on function private.award_weekly() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'buildx-award-weekly';
select cron.schedule('buildx-award-weekly', '4 * * * *', $$select private.award_weekly()$$);

/** Streaks: the student's current and best runs of their group's sessions attended in a row. */
create or replace function private.streaks(p_student uuid) returns table (current int, best int)
language sql stable security definer set search_path = ''
as $$
  with g as (select group_name from public.students where id = p_student),
  s as (
    select se.id, se.starts_at, (a.status in ('present', 'late')) as came
      from public.attendance_sessions se
      cross join g
      left join public.attendance a on a.session_id = se.id and a.student_id = p_student
     where se.closed_at is not null and (se.group_name = '' or se.group_name = g.group_name)
       and se.starts_at >= (select created_at from public.students where id = p_student) - interval '1 day'
  ),
  runs as (
    select came, starts_at, sum(case when coalesce(came, false) then 0 else 1 end) over (order by starts_at) as breaks from s
  ),
  lens as (
    select breaks, count(*) filter (where coalesce(came, false)) as len, max(starts_at) as last_at from runs group by breaks
  )
  select coalesce((select len from lens order by last_at desc limit 1), 0)::int,
         coalesce((select max(len) from lens), 0)::int
$$;
revoke execute on function private.streaks(uuid) from public, anon, authenticated;

-- The student's points now carry the streak, and five in a row is a badge.
create or replace function public.student_points(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_out jsonb;
  v_streak record;
begin
  select * into v_streak from private.streaks(v_id);
  with p as (select * from private.student_scores()),
       me as (select * from p where student_id = v_id),
       grp as (select p.* from p, me where p.group_name = me.group_name)
  select jsonb_build_object(
    'points', me.points,
    'rank', (select count(*) + 1 from grp where grp.points > me.points),
    'of', (select count(*) from grp),
    'group', me.group_name,
    'breakdown', jsonb_build_object('attended', me.attended, 'quizzes', me.quizzes, 'perfect', me.perfect, 'certs', me.certs, 'events', me.events, 'bonus', me.bonus, 'tasks', me.tasks),
    'badges', to_jsonb(private.badges(me.attended, me.quizzes, me.perfect, me.certs, me.events, me.bonus)
                       || case when v_streak.best >= 5 then array['on_fire'] else array[]::text[] end),
    'streak', jsonb_build_object('current', v_streak.current, 'best', v_streak.best),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', private.short_name(t.name), 'points', t.points, 'me', t.student_id = v_id) order by t.points desc, t.name)
        from (select * from grp order by points desc, name limit 10) t
    ), '[]'::jsonb)
  ) into v_out
  from me;
  return coalesce(v_out, jsonb_build_object('points', 0, 'badges', '[]'::jsonb, 'top', '[]'::jsonb));
end $$;
