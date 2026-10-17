-- Points written by whoever sets the work, instead of fixed numbers:
--   team tasks        → staff_tasks.points (what an on-time hand-in earns; late earns a third, a missed one costs two thirds)
--   student tasks     → the grade out of max_points now counts as it is (it used to be squeezed to 20)
--   course            → points per lecture/file (earned when opened) and per quiz (scaled by the best score),
--                       plus a completion bonus per group when progress reaches 100%.
-- The defaults reproduce the old numbers for team tasks (30 / 10 / 15 / -20) so nothing moves until someone edits a task.

alter table public.staff_tasks add column if not exists points int not null default 30 check (points between 0 and 1000);
alter table public.materials add column if not exists points int not null default 5 check (points between 0 and 1000);
alter table public.quizzes add column if not exists points int not null default 20 check (points between 0 and 1000);

create table if not exists public.course_bonus (
  group_name text primary key check (char_length(group_name) between 1 and 60),
  points int not null check (points between 0 and 1000),
  updated_at timestamptz not null default now()
);
alter table public.course_bonus enable row level security;
create policy course_bonus_select on public.course_bonus for select to authenticated
  using ((select private.can('content')) or (select private.can('students')));
create policy course_bonus_write on public.course_bonus for all to authenticated
  using ((select private.can('content'))) with check ((select private.can('content')));
grant select, insert, update, delete on public.course_bonus to authenticated;
revoke all on public.course_bonus from anon;

-- ── team tasks: the points are set on the task (a separate call keeps staff_task_save as it is)
create or replace function public.staff_task_points(p_task uuid, p_points int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sector uuid;
begin
  if p_points is null or p_points < 0 or p_points > 1000 then
    raise exception 'bad_points' using errcode = '22023';
  end if;
  select sector_id into v_sector from public.staff_tasks where id = p_task and status <> 'cancelled';
  if v_sector is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if not private.leads_sector(v_sector) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_tasks set points = p_points where id = p_task;
end $$;
revoke execute on function public.staff_task_points(uuid, int) from public, anon;
grant execute on function public.staff_task_points(uuid, int) to authenticated;

-- ── team XP follows the task's points (30 → 30 / 10 / 15 / -20 exactly as before)
select private.patch_function('private.staff_xp_calc(uuid, timestamptz)'::regprocedure,
  'v_on_time int; v_late int;',
  'v_on_time int; v_late int; v_p_on int; v_p_late int; v_p_appr int; v_p_miss int;');
select private.patch_function('private.staff_xp_calc(uuid, timestamptz)'::regprocedure,
  'count(*) filter (where a.missed_at >= v_since and a.submitted_at is null and not a.excused)
    into v_on_time, v_late, v_approved, v_missed',
  'count(*) filter (where a.missed_at >= v_since and a.submitted_at is null and not a.excused),
         coalesce(sum(t.points) filter (where a.submitted_at >= v_since and not a.late), 0),
         coalesce(sum(round(t.points / 3.0)) filter (where a.submitted_at >= v_since and a.late), 0),
         coalesce(sum(round(t.points / 2.0)) filter (where a.state = ''approved'' and coalesce(a.reviewed_at, a.submitted_at) >= v_since), 0),
         coalesce(sum(round(t.points * 2 / 3.0)) filter (where a.missed_at >= v_since and a.submitted_at is null and not a.excused), 0)
    into v_on_time, v_late, v_approved, v_missed, v_p_on, v_p_late, v_p_appr, v_p_miss');
select private.patch_function('private.staff_xp_calc(uuid, timestamptz)'::regprocedure,
  'v_tasks := v_on_time * 30 + v_late * 10 + v_approved * 15 - v_missed * 20;',
  'v_tasks := v_p_on + v_p_late + v_p_appr - v_p_miss;');

-- ── students: graded work counts as written; lectures, quizzes and a finished course earn what was set
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
    select b.student_id, count(*) as quizzes, count(*) filter (where b.best >= 1) as perfect, sum(round(b.best * z.points)) as pts
      from (
        select student_id, quiz_id, max(case when max_score > 0 then least(score / max_score, 1) else 0 end) as best
          from public.quiz_attempts where submitted_at is not null and score is not null group by student_id, quiz_id
      ) b join public.quizzes z on z.id = b.quiz_id
     group by b.student_id
  ), c as (
    select student_id, count(*) as certs from public.certificates where student_id is not null and revoked_at is null group by student_id
  ), e as (
    select s.id as student_id, count(distinct r.event_id) as events
      from public.students s join public.event_registrations r on r.phone = private.norm_phone(s.phone) and r.checked_in_at is not null
     where s.phone is not null group by s.id
  ), b as (
    select student_id, sum(points) as bonus from public.student_bonus group by student_id
  ), t as (
    select s.student_id, count(*) as tasks, sum(round(least(s.grade, a.max_points))) as pts
      from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id
     where s.grade is not null group by s.student_id
  ), m as (
    select v.student_id, sum(mt.points) as pts
      from public.material_views v join public.materials mt on mt.id = v.material_id and mt.published
     group by v.student_id
  ), k as (
    select p.student_id, cb.points as pts
      from private.progress_table(null) p
      join public.students s on s.id = p.student_id
      join public.course_bonus cb on cb.group_name = s.group_name
     where p.percent >= 100
  )
  select s.id, s.full_name, s.group_name,
         coalesce(a.attended, 0)::int, coalesce(q.quizzes, 0)::int, coalesce(q.perfect, 0)::int, coalesce(c.certs, 0)::int,
         coalesce(e.events, 0)::int, coalesce(b.bonus, 0)::int, coalesce(t.tasks, 0)::int,
         greatest(0, coalesce(a.pts, 0) + coalesce(q.pts, 0) + coalesce(c.certs, 0) * 30 + coalesce(e.events, 0) * 15 + coalesce(b.bonus, 0)
                     + coalesce(t.pts, 0) + coalesce(m.pts, 0) + coalesce(k.pts, 0))::int
    from public.students s
    left join a on a.student_id = s.id left join q on q.student_id = s.id left join c on c.student_id = s.id
    left join e on e.student_id = s.id left join b on b.student_id = s.id left join t on t.student_id = s.id
    left join m on m.student_id = s.id left join k on k.student_id = s.id
   where s.active
$$;
revoke execute on function private.student_scores() from public, anon, authenticated;

-- ── the student's home shows what a lecture or quiz is worth
select private.patch_function('public.student_home(text)'::regprocedure, '''size'', m.size_bytes, ''pinned'', m.pinned,', '''size'', m.size_bytes, ''points'', m.points, ''pinned'', m.pinned,');
select private.patch_function('public.student_home(text)'::regprocedure, '''maxAttempts'', q.max_attempts,', '''maxAttempts'', q.max_attempts, ''points'', q.points,');
