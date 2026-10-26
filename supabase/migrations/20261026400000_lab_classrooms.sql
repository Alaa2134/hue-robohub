-- Lab Classrooms, on top of the tasks students already submit: a task can be a Lab task — it starts
-- from one of the Lab's challenges (checked in the simulator) or from a circuit the trainer built in
-- the Lab. The student opens it in the editor and submits their project; the submission keeps the
-- project and what the check measured, and the trainer opens the project from the task to grade it.

alter table public.assignments
  add column if not exists lab_challenge text check (lab_challenge ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  add column if not exists lab_template uuid references public.lab_projects(id) on delete set null;

alter table public.assignment_submissions
  add column if not exists lab_project_id uuid references public.lab_projects(id) on delete set null,
  add column if not exists lab_checks jsonb check (lab_checks is null or (jsonb_typeof(lab_checks) = 'array' and pg_column_size(lab_checks) < 8000)),
  add column if not exists lab_passed boolean;
create index if not exists assignment_submissions_lab on public.assignment_submissions (lab_project_id) where lab_project_id is not null;

-- Trainers (the tasks area) can open a project a student submitted to a task, to look and grade.
select private.patch_function('private.lab_role(public.lab_projects,text,uuid,text)',
  $p$  if p_project.hidden_reason is null and (p_project.visibility = 'public'$p$,
  $p$  if p_kind = 'staff' and private.can_read('tasks')
     and exists (select 1 from public.assignment_submissions s where s.lab_project_id = p_project.id) then
    return 'viewer';
  end if;
  if p_project.hidden_reason is null and (p_project.visibility = 'public'$p$);

/** This student's Lab tasks: the starter (challenge or the trainer's circuit), the due date and their submission. */
create or replace function public.lab_assignments(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
begin
  select group_name into v_group from public.students where id = v_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'title', a.title, 'description', a.description, 'due', a.due_at, 'max_points', a.max_points, 'allow_late', a.allow_late,
             'challenge', a.lab_challenge,
             'template', case when a.lab_template is not null then (select jsonb_build_object('title', p.title, 'kind', p.kind, 'data', p.data)
                                                                    from public.lab_projects p where p.id = a.lab_template and p.deleted_at is null) end,
             'submission', case when s.id is not null then jsonb_build_object(
               'at', s.submitted_at, 'late', s.late, 'project', s.lab_project_id, 'passed', s.lab_passed, 'checks', s.lab_checks,
               'grade', s.grade, 'feedback', s.feedback, 'graded_at', s.graded_at) end)
           order by a.due_at nulls last, a.created_at desc)
      from public.assignments a
      left join public.assignment_submissions s on s.assignment_id = a.id and s.student_id = v_id
     where a.published and (a.group_name = '' or a.group_name = v_group) and (a.lab_challenge is not null or a.lab_template is not null)), '[]');
end $$;

/**
 * A student submits their Lab project for a task. The project must be theirs. When the task is a
 * challenge, the checks are what the simulator measured on their device (recorded as reported).
 */
create or replace function public.lab_assignment_submit(p_token text, p_assignment uuid, p_project uuid, p_checks jsonb default null, p_passed boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  a public.assignments;
  v_group text;
  v_late boolean;
  v_title text;
begin
  select * into a from public.assignments where id = p_assignment and published and (lab_challenge is not null or lab_template is not null);
  select group_name into v_group from public.students where id = v_id;
  if a.id is null or not (a.group_name = '' or a.group_name = v_group) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select title into v_title from public.lab_projects where id = p_project and owner_kind = 'student' and owner_id = v_id and deleted_at is null;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'project');
  end if;
  if exists (select 1 from public.assignment_submissions where assignment_id = a.id and student_id = v_id and grade is not null) then
    return jsonb_build_object('ok', false, 'error', 'graded');
  end if;
  v_late := a.due_at is not null and now() > a.due_at;
  if v_late and not a.allow_late then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if p_checks is not null and (jsonb_typeof(p_checks) <> 'array' or jsonb_array_length(p_checks) > 12) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into public.assignment_submissions (assignment_id, student_id, body, link, files, submitted_at, late, lab_project_id, lab_checks, lab_passed)
  values (a.id, v_id, left('مشروع اللاب: ' || v_title, 4000), null, '[]', now(), v_late, p_project,
          case when a.lab_challenge is not null then p_checks end,
          case when a.lab_challenge is not null then coalesce(p_passed, false) and p_checks is not null
                                                     and not exists (select 1 from jsonb_array_elements(p_checks) e where (e->>'ok')::boolean is not true) end)
  on conflict (assignment_id, student_id) do update
    set body = excluded.body, submitted_at = now(), late = excluded.late, lab_project_id = excluded.lab_project_id,
        lab_checks = excluded.lab_checks, lab_passed = excluded.lab_passed;
  return jsonb_build_object('ok', true, 'late', v_late);
end $$;

revoke all on function public.lab_assignments(text), public.lab_assignment_submit(text, uuid, uuid, jsonb, boolean) from public;
grant execute on function public.lab_assignments(text), public.lab_assignment_submit(text, uuid, uuid, jsonb, boolean) to anon, authenticated;
