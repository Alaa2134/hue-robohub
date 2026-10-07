-- Assignments: the coach posts a task with a due date for a group, students hand in text, a link
-- and/or files from the app, the coach grades it with feedback. Graded tasks count towards points
-- (each one up to 20, like quizzes). Files live in the private "submissions" bucket; students get a
-- one-time upload URL from the student-upload Edge Function (they have no Supabase Auth account).

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  group_name text not null default '' check (char_length(group_name) <= 60),
  due_at timestamptz,
  max_points int not null default 10 check (max_points between 1 and 1000),
  allow_late boolean not null default true,
  published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_group_idx on public.assignments (group_name, due_at);
create index assignments_created_by_idx on public.assignments (created_by);
create trigger assignments_touch before update on public.assignments for each row execute function private.touch();

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  link text check (link is null or (link ~ '^https?://' and char_length(link) <= 500)),
  files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 5),
  submitted_at timestamptz not null default now(),
  late boolean not null default false,
  grade numeric(7, 2) check (grade is null or grade >= 0),
  feedback text not null default '' check (char_length(feedback) <= 2000),
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  unique (assignment_id, student_id)
);
create index assignment_submissions_student_idx on public.assignment_submissions (student_id);
create index assignment_submissions_graded_by_idx on public.assignment_submissions (graded_by);

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
create policy assignments_staff_select on public.assignments for select to authenticated using ((select private.is_staff()));
create policy assignments_staff_insert on public.assignments for insert to authenticated with check ((select private.is_staff()));
create policy assignments_staff_update on public.assignments for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy assignments_staff_delete on public.assignments for delete to authenticated using ((select private.is_staff()));
create policy submissions_staff_select on public.assignment_submissions for select to authenticated using ((select private.is_staff()));
grant select, insert, update, delete on public.assignments to authenticated;
grant select on public.assignment_submissions to authenticated;
revoke all on public.assignments, public.assignment_submissions from anon;
create trigger assignments_audit after delete on public.assignments for each row execute function private.audit();

insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 20971520)
on conflict (id) do nothing;
create policy submissions_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (select private.is_staff()));

/** Student: the tasks for their group, with what they handed in and the grade. */
create or replace function public.student_tasks(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
begin
  select group_name into v_group from public.students where id = v_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'description', a.description, 'dueAt', a.due_at, 'maxPoints', a.max_points, 'allowLate', a.allow_late,
      'submission', case when s.id is null then null else jsonb_build_object(
        'submittedAt', s.submitted_at, 'late', s.late, 'body', s.body, 'link', s.link,
        'files', (select coalesce(jsonb_agg(jsonb_build_object('name', f ->> 'name', 'size', (f ->> 'size')::bigint)), '[]') from jsonb_array_elements(s.files) f),
        'grade', s.grade, 'feedback', s.feedback, 'gradedAt', s.graded_at) end
    ) order by a.due_at nulls last, a.created_at desc)
      from public.assignments a
      left join public.assignment_submissions s on s.assignment_id = a.id and s.student_id = v_id
     where a.published and (a.group_name = '' or a.group_name = v_group)
  ), '[]'::jsonb);
end $$;

/** Edge Function only: may this student upload this file for this task? Returns the storage path. */
create or replace function public.student_upload_ticket(p_token text, p_assignment uuid, p_ext text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_a public.assignments%rowtype;
  v_group text;
begin
  -- Per student: calls come through the Edge Function, so the address is the function's.
  if not private.throttle('task_upload:' || v_id, 40, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into v_a from public.assignments where id = p_assignment and published;
  select group_name into v_group from public.students where id = v_id;
  if v_a.id is null or not (v_a.group_name = '' or v_a.group_name = v_group) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from public.assignment_submissions where assignment_id = p_assignment and student_id = v_id and grade is not null) then
    return jsonb_build_object('ok', false, 'error', 'graded');
  end if;
  if not v_a.allow_late and v_a.due_at is not null and now() > v_a.due_at then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if p_size is null or p_size <= 0 or p_size > 20971520 then
    return jsonb_build_object('ok', false, 'error', 'too_big');
  end if;
  return jsonb_build_object('ok', true, 'path',
    p_assignment || '/' || v_id || '/' || gen_random_uuid() || '.' || coalesce(nullif(lower(regexp_replace(coalesce(p_ext, ''), '[^a-zA-Z0-9]', '', 'g')), ''), 'bin'));
end $$;

/** Student: hand in (or replace, until it's graded) their work for a task. */
create or replace function public.student_submit(p_token text, p_assignment uuid, p_body text, p_link text, p_files jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_a public.assignments%rowtype;
  v_group text;
  v_files jsonb := '[]';
  v_f jsonb;
  v_late boolean;
begin
  select * into v_a from public.assignments where id = p_assignment and published;
  select group_name into v_group from public.students where id = v_id;
  if v_a.id is null or not (v_a.group_name = '' or v_a.group_name = v_group) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from public.assignment_submissions where assignment_id = p_assignment and student_id = v_id and grade is not null) then
    return jsonb_build_object('ok', false, 'error', 'graded');
  end if;
  v_late := v_a.due_at is not null and now() > v_a.due_at;
  if v_late and not v_a.allow_late then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  -- Only files this student uploaded for this task (the path says so, and the object exists).
  for v_f in select * from jsonb_array_elements(coalesce(p_files, '[]')) loop
    if (v_f ->> 'path') is null or (v_f ->> 'path') not like p_assignment || '/' || v_id || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'submissions' and o.name = v_f ->> 'path') then
      return jsonb_build_object('ok', false, 'error', 'bad_file');
    end if;
    v_files := v_files || jsonb_build_array(jsonb_build_object('path', v_f ->> 'path', 'name', left(coalesce(v_f ->> 'name', 'file'), 160),
      'size', coalesce((v_f ->> 'size')::bigint, 0), 'mime', left(coalesce(v_f ->> 'mime', ''), 100)));
  end loop;
  if btrim(coalesce(p_body, '')) = '' and nullif(btrim(coalesce(p_link, '')), '') is null and jsonb_array_length(v_files) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  insert into public.assignment_submissions (assignment_id, student_id, body, link, files, submitted_at, late)
  values (p_assignment, v_id, left(btrim(coalesce(p_body, '')), 4000), nullif(btrim(coalesce(p_link, '')), ''), v_files, now(), v_late)
  on conflict (assignment_id, student_id) do update
    set body = excluded.body, link = excluded.link, files = excluded.files, submitted_at = now(), late = excluded.late;
  return jsonb_build_object('ok', true, 'late', v_late);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** Staff: grade a submission (null grade clears it). */
create or replace function public.staff_grade_submission(p_submission uuid, p_grade numeric, p_feedback text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_max int;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.max_points into v_max from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id where s.id = p_submission;
  if v_max is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_grade is not null and (p_grade < 0 or p_grade > v_max) then
    return jsonb_build_object('ok', false, 'error', 'range');
  end if;
  update public.assignment_submissions
     set grade = p_grade, feedback = left(btrim(coalesce(p_feedback, '')), 2000),
         graded_by = case when p_grade is null then null else auth.uid() end,
         graded_at = case when p_grade is null then null else now() end
   where id = p_submission;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.student_tasks(text), public.student_upload_ticket(text, uuid, text, bigint), public.student_submit(text, uuid, text, text, jsonb),
  public.staff_grade_submission(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.student_tasks(text), public.student_submit(text, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.student_upload_ticket(text, uuid, text, bigint) to service_role;
grant execute on function public.staff_grade_submission(uuid, numeric, text) to authenticated;
