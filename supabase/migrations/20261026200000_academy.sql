-- Lab Academy: courses made of lessons that point at what already exists — a lecture (materials), a
-- quiz, a session (attendance), a Lab challenge — or a short reading. A lesson is done from the real
-- record: the material opened, the quiz passed at the course's mark, the session attended, the
-- challenge passed in the simulator. Only a reading is marked by the learner. A course completed by a
-- student shows as ready for its certificate; the team issues it.

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  title_en text check (char_length(title_en) <= 120),
  summary text not null default '' check (char_length(summary) <= 600),
  summary_en text check (char_length(summary_en) <= 600),
  group_name text not null default '',
  level smallint not null default 1 check (level between 1 and 3),
  hours int check (hours between 1 and 500),
  published boolean not null default false,
  position int not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('read', 'material', 'quiz', 'session', 'lab')),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  title_en text check (char_length(title_en) <= 140),
  body text not null default '' check (char_length(body) <= 6000),
  body_en text check (char_length(body_en) <= 6000),
  material_id uuid references public.materials(id) on delete set null,
  quiz_id uuid references public.quizzes(id) on delete set null,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  challenge text check (challenge ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  pass_percent int not null default 60 check (pass_percent between 1 and 100),
  minutes int check (minutes between 1 and 600),
  required boolean not null default true
);
create index if not exists academy_lessons_course on public.academy_lessons (course_id, position);

/** Readings a student marked as read. */
create table if not exists public.academy_reads (
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

/** Lab challenges a student passed: what the simulator measured, and the project it ran. */
create table if not exists public.lab_challenge_passes (
  student_id uuid not null references public.students(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  project_id uuid references public.lab_projects(id) on delete set null,
  checks jsonb not null default '[]' check (jsonb_typeof(checks) = 'array' and pg_column_size(checks) < 8000),
  sim_seconds numeric,
  passed_at timestamptz not null default now(),
  primary key (student_id, slug)
);

/**
 * The challenges the Lab offers and what each is worth. The Lab's code lists the same slugs and
 * points (src/lab/academy/points.ts; a unit test keeps them in step). Only these can be passed.
 */
create table if not exists public.lab_challenges (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  points int not null check (points between 1 and 100),
  skill text not null check (skill in ('programming', 'electronics', 'robotics'))
);
insert into public.lab_challenges (slug, points, skill) values
  ('blink-2hz', 10, 'programming'), ('button-hold', 10, 'electronics'), ('serial-echo', 10, 'programming'), ('traffic-cycle', 20, 'programming'),
  ('dimmer-knob', 20, 'electronics'), ('night-light', 20, 'electronics'), ('servo-sweep', 20, 'robotics'), ('buzzer-a4', 20, 'programming'),
  ('seg7-seven', 30, 'electronics'), ('robot-oval', 20, 'robotics'), ('robot-rounded', 30, 'robotics'), ('robot-wavy', 30, 'robotics')
on conflict (slug) do update set points = excluded.points, skill = excluded.skill;
alter table public.lab_challenges enable row level security;
revoke all on public.lab_challenges from anon, authenticated;

/** The course a completion certificate was issued for. */
alter table public.certificates add column if not exists academy_course_id uuid references public.academy_courses(id) on delete set null;
create index if not exists certificates_academy on public.certificates (academy_course_id, student_id) where academy_course_id is not null;

alter table public.academy_courses enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_reads enable row level security;
alter table public.lab_challenge_passes enable row level security;
-- Everything goes through the functions below.
revoke all on public.academy_courses, public.academy_lessons, public.academy_reads, public.lab_challenge_passes from anon, authenticated;

create or replace function private.academy_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create or replace trigger academy_courses_touch before update on public.academy_courses
  for each row execute function private.academy_touch();

/** Is this lesson done by this student, from the real record. */
create or replace function private.academy_done(p_student uuid, l public.academy_lessons) returns boolean
language sql stable security definer set search_path = '' as $$
  select case l.kind
    when 'read' then exists (select 1 from public.academy_reads r where r.student_id = p_student and r.lesson_id = l.id)
    when 'material' then exists (select 1 from public.material_views v where v.student_id = p_student and v.material_id = l.material_id)
    when 'quiz' then exists (select 1 from public.quiz_attempts a where a.student_id = p_student and a.quiz_id = l.quiz_id and a.submitted_at is not null
                               and a.max_score > 0 and a.score * 100 >= a.max_score * l.pass_percent)
    when 'session' then exists (select 1 from public.attendance a where a.student_id = p_student and a.session_id = l.session_id and a.status in ('present', 'late'))
    when 'lab' then exists (select 1 from public.lab_challenge_passes c where c.student_id = p_student and c.slug = l.challenge)
    else false end
$$;

/** Required lessons done / required lessons, per student, for one course. */
create or replace function private.academy_course_progress(p_course uuid)
returns table (student_id uuid, done int, total int, percent int, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with c as (select * from public.academy_courses where id = p_course),
  st as (select s.id from public.students s, c where s.active and (c.group_name = '' or s.group_name = c.group_name)),
  ls as (select l from public.academy_lessons l where l.course_id = p_course and l.required)
  select st.id,
         count(*) filter (where private.academy_done(st.id, ls.l))::int,
         count(ls.l)::int,
         case when count(ls.l) = 0 then 0 else (100 * count(*) filter (where private.academy_done(st.id, ls.l)) / count(ls.l))::int end,
         (select max(r.read_at) from public.academy_reads r join public.academy_lessons l2 on l2.id = r.lesson_id where r.student_id = st.id and l2.course_id = p_course)
    from st left join ls on true
   group by st.id
$$;

/* ─── Learners (student token or team member, through the Lab) ─────────── */

/** Published courses for this person: a student sees their group's and the open ones, with their progress. */
create or replace function public.academy_catalog(p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_me uuid;
  v_group text;
begin
  begin
    select kind, id into v_kind, v_me from private.lab_actor(p_token);
  exception when others then
    v_kind := null;
  end;
  if v_kind = 'student' then select group_name into v_group from public.students where id = v_me; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'slug', c.slug, 'title', c.title, 'title_en', c.title_en, 'summary', c.summary, 'summary_en', c.summary_en,
             'level', c.level, 'hours', c.hours, 'group', nullif(c.group_name, ''),
             'lessons', (select count(*) from public.academy_lessons l where l.course_id = c.id),
             'kinds', (select coalesce(jsonb_object_agg(k, n), '{}') from (select l.kind k, count(*) n from public.academy_lessons l where l.course_id = c.id group by l.kind) x),
             'mine', v_kind = 'student' and (c.group_name = '' or c.group_name = v_group),
             'percent', case when v_kind = 'student' then (
               select case when count(*) = 0 then 0 else (100 * count(*) filter (where private.academy_done(v_me, l)) / count(*))::int end
                 from public.academy_lessons l where l.course_id = c.id and l.required) end)
           order by (v_kind = 'student' and (c.group_name = '' or c.group_name = v_group)) desc, c.position, c.created_at)
      from public.academy_courses c
     where c.published), '[]');
end $$;

/** One course with its lessons; a student gets what's done and how to do the rest. */
create or replace function public.academy_course(p_token text default null, p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_me uuid;
  c public.academy_courses;
  v_group text;
  v_open boolean;
begin
  begin
    select kind, id into v_kind, v_me from private.lab_actor(p_token);
  exception when others then
    v_kind := null;
  end;
  select * into c from public.academy_courses where slug = p_slug and (published or (v_kind = 'staff' and private.can_read('training')));
  if c.id is null then return null; end if;
  if v_kind = 'student' then select group_name into v_group from public.students where id = v_me; end if;
  v_open := v_kind = 'student' and (c.group_name = '' or c.group_name = v_group);
  return jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'title', c.title, 'title_en', c.title_en, 'summary', c.summary, 'summary_en', c.summary_en,
    'level', c.level, 'hours', c.hours, 'group', nullif(c.group_name, ''), 'published', c.published,
    'enrolled', v_open,
    'certificate', case when v_kind = 'student' then (
      select jsonb_build_object('code', x.code, 'on', x.issued_on) from public.certificates x
       where x.student_id = v_me and x.revoked_at is null and x.academy_course_id = c.id order by x.issued_on desc limit 1) end,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'kind', l.kind, 'title', l.title, 'title_en', l.title_en, 'body', l.body, 'body_en', l.body_en,
               'minutes', l.minutes, 'required', l.required, 'pass', l.pass_percent, 'challenge', l.challenge,
               'done', case when v_open then private.academy_done(v_me, l) end,
               'material', case when l.material_id is not null then (
                 select jsonb_build_object('id', m.id, 'title', m.title, 'kind', m.kind, 'url', case when v_open or v_kind = 'staff' then m.url end,
                                           'path', case when v_open or v_kind = 'staff' then m.storage_path end)
                   from public.materials m where m.id = l.material_id and m.published) end,
               'quiz', case when l.quiz_id is not null then (
                 select jsonb_build_object('id', q.id, 'title', q.title, 'opens', q.opens_at, 'closes', q.closes_at,
                                           'best', case when v_open then (select max(round(100 * t.score / nullif(t.max_score, 0))) from public.quiz_attempts t
                                                                            where t.quiz_id = q.id and t.student_id = v_me and t.submitted_at is not null) end)
                   from public.quizzes q where q.id = l.quiz_id and q.published) end,
               'session', case when l.session_id is not null then (
                 select jsonb_build_object('title', s.title, 'at', s.starts_at) from public.attendance_sessions s where s.id = l.session_id) end
             ) order by l.position, l.id)
        from public.academy_lessons l where l.course_id = c.id), '[]'));
end $$;

/** A student marks a reading as read. */
create or replace function public.academy_read(p_token text, p_lesson uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  l public.academy_lessons;
begin
  select l2.* into l from public.academy_lessons l2 join public.academy_courses c on c.id = l2.course_id
    join public.students s on s.id = v_id
   where l2.id = p_lesson and l2.kind = 'read' and c.published and (c.group_name = '' or c.group_name = s.group_name);
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.academy_reads (student_id, lesson_id) values (v_id, l.id) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

/**
 * A student passed a Lab challenge: the checks the simulator ran on their program. The project, when
 * given, must be theirs. The check runs on the learner's device, so this records what it reported.
 */
create or replace function public.lab_challenge_pass(p_token text, p_slug text, p_project uuid default null, p_checks jsonb default '[]', p_seconds numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,40}$' or jsonb_typeof(p_checks) <> 'array' or jsonb_array_length(p_checks) = 0 or jsonb_array_length(p_checks) > 12
     or exists (select 1 from jsonb_array_elements(p_checks) e where (e->>'ok')::boolean is not true) then
    return jsonb_build_object('ok', false, 'error', 'not_passed');
  end if;
  if not exists (select 1 from public.lab_challenges c where c.slug = p_slug) then
    return jsonb_build_object('ok', false, 'error', 'unknown_challenge');
  end if;
  if p_project is not null and not exists (select 1 from public.lab_projects p where p.id = p_project and p.owner_kind = 'student' and p.owner_id = v_id) then
    p_project := null;
  end if;
  insert into public.lab_challenge_passes (student_id, slug, project_id, checks, sim_seconds)
  values (v_id, p_slug, p_project, p_checks, p_seconds)
  on conflict (student_id, slug) do update set project_id = coalesce(excluded.project_id, lab_challenge_passes.project_id), checks = excluded.checks,
                                               sim_seconds = excluded.sim_seconds;
  return jsonb_build_object('ok', true);
end $$;

/** The challenges this student has passed (slugs and when). */
create or replace function public.lab_challenge_passes_mine(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(slug, passed_at), '{}') from public.lab_challenge_passes where student_id = private.session_student(p_token)
$$;

/**
 * Challenge points: the signed-in student's total and rank, and the top 10 of their group and of
 * everyone (first name and an initial only). Ties go to whoever got there first.
 */
create or replace function public.lab_challenge_board(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
begin
  select s.group_name into v_group from public.students s where s.id = v_id;
  return (
    with t as (
      select s.id, s.group_name,
             split_part(btrim(s.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(s.full_name), ' ', 2), ''), 1) || '.', '') as name,
             sum(c.points)::int as points, count(*)::int as passed, max(p.passed_at) as last_at
        from public.lab_challenge_passes p
        join public.lab_challenges c on c.slug = p.slug
        join public.students s on s.id = p.student_id and s.active
       group by s.id
    ), me as (select * from t where t.id = v_id)
    select jsonb_build_object(
      'me', (select jsonb_build_object('points', me.points, 'passed', me.passed,
                                       'rank', (select count(*) + 1 from t where t.points > me.points or (t.points = me.points and t.last_at < me.last_at)),
                                       'group_rank', (select count(*) + 1 from t where t.group_name is not distinct from me.group_name
                                                        and (t.points > me.points or (t.points = me.points and t.last_at < me.last_at))))
               from me),
      'group', v_group,
      'group_top', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'points', x.points, 'passed', x.passed, 'me', x.id = v_id) order by x.points desc, x.last_at)
                               from (select * from t where v_group is not null and t.group_name = v_group order by t.points desc, t.last_at limit 10) x), '[]'),
      'top', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'points', x.points, 'passed', x.passed, 'me', x.id = v_id) order by x.points desc, x.last_at)
                         from (select * from t order by t.points desc, t.last_at limit 10) x), '[]'),
      'points', (select jsonb_object_agg(c.slug, c.points) from public.lab_challenges c)
    )
  );
end $$;

/* ─── Team ─────────────────────────────────────────────────────────────── */

create or replace function public.staff_academy_courses()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('training') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'slug', c.slug, 'title', c.title, 'title_en', c.title_en, 'summary', c.summary, 'summary_en', c.summary_en,
             'group', c.group_name, 'level', c.level, 'hours', c.hours, 'published', c.published, 'position', c.position, 'updated_at', c.updated_at,
             'lessons', coalesce((select jsonb_agg(to_jsonb(l) - 'course_id' order by l.position, l.id) from public.academy_lessons l where l.course_id = c.id), '[]'),
             'students', (select count(*) from private.academy_course_progress(c.id)),
             'complete', (select count(*) from private.academy_course_progress(c.id) p where p.total > 0 and p.done = p.total))
           order by c.position, c.created_at)
      from public.academy_courses c), '[]');
end $$;

/** Save a course and its lessons in one go (lessons not in the list are removed; their reads go with them). */
create or replace function public.staff_academy_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_keep uuid[] := '{}';
  x jsonb;
  i int := 0;
  v_l uuid;
begin
  if not private.can('training') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_id is null then
    insert into public.academy_courses (slug, title, title_en, summary, summary_en, group_name, level, hours, published, position)
    values (p->>'slug', p->>'title', nullif(p->>'title_en', ''), coalesce(p->>'summary', ''), nullif(p->>'summary_en', ''), coalesce(p->>'group', ''),
            coalesce((p->>'level')::smallint, 1), nullif(p->>'hours', '')::int, coalesce((p->>'published')::boolean, false), coalesce((p->>'position')::int, 0))
    returning id into v_id;
  else
    update public.academy_courses set slug = p->>'slug', title = p->>'title', title_en = nullif(p->>'title_en', ''), summary = coalesce(p->>'summary', ''),
           summary_en = nullif(p->>'summary_en', ''), group_name = coalesce(p->>'group', ''), level = coalesce((p->>'level')::smallint, 1),
           hours = nullif(p->>'hours', '')::int, published = coalesce((p->>'published')::boolean, false), position = coalesce((p->>'position')::int, position)
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  if jsonb_typeof(p->'lessons') = 'array' then
    if jsonb_array_length(p->'lessons') > 80 then raise exception 'too_many_lessons'; end if;
    for x in select * from jsonb_array_elements(p->'lessons') loop
      i := i + 1;
      if (x->>'kind' = 'material' and nullif(x->>'material_id', '') is null) or (x->>'kind' = 'quiz' and nullif(x->>'quiz_id', '') is null)
         or (x->>'kind' = 'session' and nullif(x->>'session_id', '') is null) or (x->>'kind' = 'lab' and nullif(x->>'challenge', '') is null) then
        raise exception 'lesson_needs_source' using detail = i::text;
      end if;
      v_l := nullif(x->>'id', '')::uuid;
      if v_l is not null and exists (select 1 from public.academy_lessons where id = v_l and course_id = v_id) then
        update public.academy_lessons set position = i, kind = x->>'kind', title = x->>'title', title_en = nullif(x->>'title_en', ''),
               body = coalesce(x->>'body', ''), body_en = nullif(x->>'body_en', ''),
               material_id = case when x->>'kind' = 'material' then nullif(x->>'material_id', '')::uuid end,
               quiz_id = case when x->>'kind' = 'quiz' then nullif(x->>'quiz_id', '')::uuid end,
               session_id = case when x->>'kind' = 'session' then nullif(x->>'session_id', '')::uuid end,
               challenge = case when x->>'kind' = 'lab' then nullif(x->>'challenge', '') end,
               pass_percent = coalesce((x->>'pass_percent')::int, 60), minutes = nullif(x->>'minutes', '')::int, required = coalesce((x->>'required')::boolean, true)
         where id = v_l;
      else
        insert into public.academy_lessons (course_id, position, kind, title, title_en, body, body_en, material_id, quiz_id, session_id, challenge, pass_percent, minutes, required)
        values (v_id, i, x->>'kind', x->>'title', nullif(x->>'title_en', ''), coalesce(x->>'body', ''), nullif(x->>'body_en', ''),
                case when x->>'kind' = 'material' then nullif(x->>'material_id', '')::uuid end,
                case when x->>'kind' = 'quiz' then nullif(x->>'quiz_id', '')::uuid end,
                case when x->>'kind' = 'session' then nullif(x->>'session_id', '')::uuid end,
                case when x->>'kind' = 'lab' then nullif(x->>'challenge', '') end,
                coalesce((x->>'pass_percent')::int, 60), nullif(x->>'minutes', '')::int, coalesce((x->>'required')::boolean, true))
        returning id into v_l;
      end if;
      v_keep := v_keep || v_l;
    end loop;
    delete from public.academy_lessons where course_id = v_id and id <> all (v_keep);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

/** What a course can point at: published lectures and quizzes, and sessions, for its group. */
create or replace function public.staff_academy_sources(p_group text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('training') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'group', group_name, 'published', published) order by created_at desc)
                             from public.materials where p_group = '' or group_name in ('', p_group)), '[]'),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'group', group_name, 'published', published) order by created_at desc)
                           from public.quizzes where p_group = '' or group_name in ('', p_group)), '[]'),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'group', group_name, 'at', starts_at) order by starts_at desc)
                            from public.attendance_sessions where p_group = '' or group_name in ('', p_group)), '[]'),
    'groups', coalesce((select jsonb_agg(distinct group_name) from public.students where group_name <> ''), '[]'));
end $$;

/** Each student of a course: lessons done, and whether a certificate was issued for it. */
create or replace function public.staff_academy_progress(p_course uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.academy_courses;
begin
  if not private.can_read('training') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.academy_courses where id = p_course;
  if c.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.full_name, 'code', s.code, 'group', s.group_name, 'done', p.done, 'total', p.total, 'percent', p.percent,
             'lessons', (select coalesce(jsonb_agg(l.id), '[]') from public.academy_lessons l where l.course_id = c.id and private.academy_done(s.id, l)),
             'certificate', (select x.code from public.certificates x where x.student_id = s.id and x.revoked_at is null and x.academy_course_id = c.id limit 1))
           order by p.percent desc, s.full_name)
      from private.academy_course_progress(c.id) p join public.students s on s.id = p.student_id), '[]');
end $$;

/** Issue the course's completion certificate to students who completed every required lesson (once each). */
create or replace function public.staff_academy_issue(p_course uuid, p_students uuid[], p_design text default 'classic')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.academy_courses;
  n int;
begin
  if not private.can('certificates') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.academy_courses where id = p_course;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.certificates (academy_course_id, student_id, recipient_name, kind, title, title_ar, details, details_ar, hours, design)
  select c.id, s.id, s.full_name, 'completion', coalesce(nullif(c.title_en, ''), c.title), c.title,
         left(format('Completed all %s lessons of the BuildX Academy course.', p.total), 300),
         left(format('أكمل كل دروس الكورس (%s درس) في أكاديمية BuildX.', p.total), 300),
         c.hours, p_design
    from private.academy_course_progress(c.id) p join public.students s on s.id = p.student_id
   where s.id = any (p_students) and p.total > 0 and p.done = p.total
     and not exists (select 1 from public.certificates x where x.student_id = s.id and x.revoked_at is null and x.academy_course_id = c.id);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'issued', n);
end $$;

revoke all on function private.academy_done(uuid, public.academy_lessons), private.academy_course_progress(uuid) from public, anon, authenticated;
revoke all on function public.academy_catalog(text), public.academy_course(text, text), public.academy_read(text, uuid),
  public.lab_challenge_pass(text, text, uuid, jsonb, numeric), public.lab_challenge_passes_mine(text), public.lab_challenge_board(text) from public;
grant execute on function public.academy_catalog(text), public.academy_course(text, text), public.academy_read(text, uuid),
  public.lab_challenge_pass(text, text, uuid, jsonb, numeric), public.lab_challenge_passes_mine(text), public.lab_challenge_board(text) to anon, authenticated;
revoke all on function public.staff_academy_courses(), public.staff_academy_save(jsonb), public.staff_academy_sources(text),
  public.staff_academy_progress(uuid), public.staff_academy_issue(uuid, uuid[], text) from public, anon;
grant execute on function public.staff_academy_courses(), public.staff_academy_save(jsonb), public.staff_academy_sources(text),
  public.staff_academy_progress(uuid), public.staff_academy_issue(uuid, uuid[], text) to authenticated;
