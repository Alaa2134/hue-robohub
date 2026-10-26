-- Skill Passport: a page a student chooses to share (/passport?id=…) showing what they have actually
-- done, from the records: certificates (each verifiable by its code), Lab challenges passed in the
-- simulator, Academy courses completed, quizzes passed, sessions attended, graded tasks and projects
-- published on the site. Off until the student turns it on. It never shows a phone number, a student
-- code, a card or anything typed by the team about them; the name is the first name and an initial
-- unless the student picks the full name. A new link can be made at any time (the old one stops).
-- Needs 20261026200000_academy.sql (Lab challenge passes, Academy courses).

create table if not exists public.skill_passports (
  student_id uuid primary key references public.students(id) on delete cascade,
  slug text not null unique default encode(extensions.gen_random_bytes(8), 'hex') check (slug ~ '^[0-9a-f]{16}$'),
  visible boolean not null default false,
  full_name boolean not null default false,
  show_group boolean not null default false,
  headline text not null default '' check (char_length(headline) <= 140),
  updated_at timestamptz not null default now()
);
alter table public.skill_passports enable row level security;
revoke all on public.skill_passports from anon, authenticated;

/** What a passport shows, built from the records. Never anything private. */
create or replace function private.passport_data(p_student uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', case when p.full_name then btrim(s.full_name)
                 else split_part(btrim(s.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(s.full_name), ' ', 2), ''), 1) || '.', '') end,
    'group', case when p.show_group then nullif(s.group_name, '') end,
    'headline', nullif(p.headline, ''),
    'since', to_char(s.created_at at time zone 'Africa/Cairo', 'YYYY-MM'),
    'certificates', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'kind', c.kind, 'title', c.title, 'title_ar', c.title_ar, 'hours', c.hours, 'on', c.issued_on) order by c.issued_on desc)
        from public.certificates c where c.student_id = s.id and c.revoked_at is null), '[]'),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object('slug', x.slug, 'on', (x.passed_at at time zone 'Africa/Cairo')::date) order by x.passed_at)
        from public.lab_challenge_passes x join public.lab_challenges lc on lc.slug = x.slug where x.student_id = s.id), '[]'),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('title', c.title, 'title_en', c.title_en, 'lessons', g.total) order by c.position)
        from public.academy_courses c cross join lateral private.academy_course_progress(c.id) g
       where c.published and g.student_id = s.id and g.total > 0 and g.done = g.total), '[]'),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('title', sp.title, 'description', left(sp.description, 280), 'url', sp.url) order by sp.created_at desc)
        from public.student_projects sp where sp.student_id = s.id and sp.status = 'published'), '[]'),
    'numbers', jsonb_build_object(
      'sessions', (select count(*) from public.attendance a where a.student_id = s.id and a.status in ('present', 'late')),
      'quizzes', (select count(distinct q.quiz_id) from public.quiz_attempts q
                   where q.student_id = s.id and q.submitted_at is not null and q.max_score > 0 and q.score * 100 >= q.max_score * 60),
      'tasks', (select count(*) from public.assignment_submissions t where t.student_id = s.id and t.grade is not null))
  )
  from public.students s join public.skill_passports p on p.student_id = s.id
  where s.id = p_student
$$;

/** The student's passport settings and what it shows (made, switched off, the first time). */
create or replace function public.student_passport(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  p public.skill_passports;
begin
  insert into public.skill_passports (student_id) values (v_id) on conflict do nothing;
  select * into p from public.skill_passports where student_id = v_id;
  return jsonb_build_object('slug', p.slug, 'visible', p.visible, 'full_name', p.full_name, 'show_group', p.show_group, 'headline', p.headline,
                            'preview', private.passport_data(v_id));
end $$;

/** Change what the passport shows; p_new_link makes a new address (the old one stops working). */
create or replace function public.student_passport_save(p_token text, p_visible boolean, p_full_name boolean default false, p_show_group boolean default false,
                                                        p_headline text default '', p_new_link boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  if char_length(coalesce(p_headline, '')) > 140 then return jsonb_build_object('ok', false, 'error', 'headline'); end if;
  insert into public.skill_passports (student_id) values (v_id) on conflict do nothing;
  update public.skill_passports
     set visible = coalesce(p_visible, false), full_name = coalesce(p_full_name, false), show_group = coalesce(p_show_group, false),
         headline = btrim(coalesce(p_headline, '')), updated_at = now(),
         slug = case when p_new_link then encode(extensions.gen_random_bytes(8), 'hex') else slug end
   where student_id = v_id;
  return public.student_passport(p_token) || jsonb_build_object('ok', true);
end $$;

/** Anyone with the link: the passport, if its owner turned it on and is still an active student. */
create or replace function public.passport_public(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.throttle('passport_public', 60, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_slug is null or p_slug !~ '^[0-9a-f]{16}$' then return jsonb_build_object('ok', true, 'found', false); end if;
  select p.student_id into v_id from public.skill_passports p join public.students s on s.id = p.student_id
   where p.slug = p_slug and p.visible and s.active;
  if v_id is null then return jsonb_build_object('ok', true, 'found', false); end if;
  return jsonb_build_object('ok', true, 'found', true) || private.passport_data(v_id);
end $$;

revoke all on function private.passport_data(uuid) from public, anon, authenticated;
revoke all on function public.student_passport(text), public.student_passport_save(text, boolean, boolean, boolean, text, boolean), public.passport_public(text) from public;
grant execute on function public.student_passport(text), public.student_passport_save(text, boolean, boolean, boolean, text, boolean), public.passport_public(text) to anon, authenticated;
