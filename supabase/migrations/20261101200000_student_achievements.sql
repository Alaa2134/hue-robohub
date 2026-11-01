-- Student achievements: tiered badges (bronze, silver, gold, diamond) worked out from the student's
-- own records only — sessions attended, attendance streak, quizzes, full marks, graded tasks,
-- lectures opened, events, certificates, Lab challenges, published projects, the team's appreciation
-- points, total points, and finishing the course. Each earned tier is kept with its date, so the app
-- can celebrate it once (seen_at) and a daily job can send a push for new ones.

create table if not exists private.student_achievements (
  student_id uuid not null,
  key text not null check (key ~ '^[a-z_]{2,20}$'),
  tier smallint not null check (tier between 1 and 4),
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (student_id, key, tier)
);
alter table private.student_achievements enable row level security;
revoke all on private.student_achievements from public, anon, authenticated;

/** The tracks: key, Arabic name (for pushes; the app has its own copy), thresholds per tier, order. */
create or replace function private.achievement_tracks()
returns table (key text, name text, th int[], ord int)
language sql immutable set search_path = '' as $$
  values
    ('attend',  'الحضور',            array[1, 10, 25, 50],      1),
    ('streak',  'سلسلة الحضور',      array[3, 5, 10, 20],       2),
    ('quiz',    'الكويزات',          array[1, 5, 15, 30],       3),
    ('perfect', 'الدرجة النهائية',   array[1, 5, 10, 25],       4),
    ('tasks',   'التاسكات',          array[1, 5, 15, 30],       5),
    ('reader',  'المذاكرة',          array[5, 20, 50, 100],     6),
    ('events',  'الفعاليات',         array[1, 3, 6, 12],        7),
    ('certs',   'الشهادات',          array[1, 3, 5, 10],        8),
    ('lab',     'تحديات اللاب',      array[1, 3, 8, 15],        9),
    ('maker',   'صانع',              array[1, 2, 4, 8],         10),
    ('star',    'نجم الفريق',        array[20, 50, 100, 200],   11),
    ('points',  'النقاط',            array[100, 500, 1000, 2500], 12),
    ('course',  'خلّص الكورس',        array[100],                13)
$$;

/** Every active student's value on every track (or just one student's), with the tier reached and the next goal. */
create or replace function private.achievements_compute(p_student uuid default null)
returns table (student_id uuid, key text, value int, tier int, next int, th int[], ord int)
language sql stable security definer set search_path = '' as $$
  with s as (
    select * from private.student_scores() x where p_student is null or x.student_id = p_student
  ), v as (
    select s.student_id,
           s.attended, s.quizzes, s.perfect, s.tasks, s.events, s.certs, s.bonus, s.points,
           coalesce((select best from private.streaks(s.student_id)), 0) as streak,
           (select count(*) from public.material_views mv where mv.student_id = s.student_id)::int as reader,
           (select count(distinct cp.slug) from public.lab_challenge_passes cp where cp.student_id = s.student_id)::int as lab,
           (select count(*) from public.student_projects sp where sp.student_id = s.student_id and sp.status = 'published')::int as maker,
           coalesce((select max(p.percent) from private.progress_table(null) p where p.student_id = s.student_id), 0) as course
      from s
  ), u as (
    select v.student_id, t.key, t.th, t.ord,
           case t.key
             when 'attend' then v.attended when 'streak' then v.streak when 'quiz' then v.quizzes
             when 'perfect' then v.perfect when 'tasks' then v.tasks when 'reader' then v.reader
             when 'events' then v.events when 'certs' then v.certs when 'lab' then v.lab
             when 'maker' then v.maker when 'star' then v.bonus when 'points' then v.points
             when 'course' then v.course end::int as value
      from v cross join private.achievement_tracks() t
  )
  select u.student_id, u.key, u.value,
         (select count(*) from unnest(u.th) x where u.value >= x)::int,
         (select min(x) from unnest(u.th) x where x > u.value)::int,
         u.th, u.ord
    from u
$$;
revoke all on function private.achievements_compute(uuid) from public, anon, authenticated;

/** Records newly reached tiers; returns them. */
create or replace function private.achievements_sync(p_student uuid default null)
returns table (student_id uuid, key text, tier smallint)
language sql security definer set search_path = '' as $$
  insert into private.student_achievements as a (student_id, key, tier)
  select c.student_id, c.key, g::smallint
    from private.achievements_compute(p_student) c, generate_series(1, c.tier) g
  on conflict (student_id, key, tier) do nothing
  returning a.student_id, a.key, a.tier
$$;
revoke all on function private.achievements_sync(uuid) from public, anon, authenticated;

/** The student's achievements: every track with progress, the dates earned, and the ones not celebrated yet. */
create or replace function public.student_achievements(p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  perform private.achievements_sync(v_id);
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', c.key, 'value', c.value, 'tier', c.tier, 'next', c.next, 'th', to_jsonb(c.th),
          'earned', coalesce((select jsonb_agg(jsonb_build_object('tier', a.tier, 'at', a.earned_at) order by a.tier)
                                from private.student_achievements a where a.student_id = v_id and a.key = c.key), '[]'::jsonb))
        order by c.ord)
        from private.achievements_compute(v_id) c), '[]'::jsonb),
    'fresh', coalesce((
      select jsonb_agg(jsonb_build_object('key', a.key, 'tier', a.tier) order by a.earned_at, a.key, a.tier)
        from private.student_achievements a
       where a.student_id = v_id and a.seen_at is null
         -- only the highest new tier per track
         and not exists (select 1 from private.student_achievements b
                          where b.student_id = a.student_id and b.key = a.key and b.seen_at is null and b.tier > a.tier)), '[]'::jsonb));
end $$;
revoke all on function public.student_achievements(text) from public;
grant execute on function public.student_achievements(text) to anon, authenticated;

create or replace function public.student_achievements_seen(p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  update private.student_achievements set seen_at = now() where student_id = v_id and seen_at is null;
end $$;
revoke all on function public.student_achievements_seen(text) from public;
grant execute on function public.student_achievements_seen(text) to anon, authenticated;

/** Staff: one student's achievements (for the student sheet). */
create or replace function public.staff_student_achievements(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_read('training') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', c.key, 'value', c.value, 'tier', c.tier, 'next', c.next, 'th', to_jsonb(c.th)) order by c.ord)
      from private.achievements_compute(p_id) c), '[]'::jsonb);
end $$;
revoke all on function public.staff_student_achievements(uuid) from public, anon;
grant execute on function public.staff_student_achievements(uuid) to authenticated;

/** Daily: record new tiers for everyone and tell each student (one push listing what they got). */
create or replace function private.achievements_tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    with n as (select * from private.achievements_sync(null))
    select n.student_id, string_agg(t.name || ' ' || (array['برونزي', 'فضي', 'ذهبي', 'ماسي'])[n.tier], '، ' order by t.ord) as what
      from n join private.achievement_tracks() t on t.key = n.key
     where not exists (select 1 from n n2 where n2.student_id = n.student_id and n2.key = n.key and n2.tier > n.tier)
     group by n.student_id
  loop
    begin
      perform private.notify_student_ids(array[r.student_id], 'شارة جديدة 🏅', 'مبروك! خدت: ' || r.what, '#/me/points');
    exception when others then
      null;
    end;
  end loop;
end $$;
revoke all on function private.achievements_tick() from public, anon, authenticated;

-- What everyone has already earned is recorded now, quietly (the app celebrates it once, no push flood).
select count(*) from private.achievements_sync(null);

select cron.schedule('student-achievements', '17 16 * * *', 'select private.achievements_tick()');
