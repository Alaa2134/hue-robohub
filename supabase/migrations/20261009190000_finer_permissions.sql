-- Finer permissions: the owner ticks each part separately.
--   "students" is split into roster (adding/editing students, PINs, follow-up), attendance, quizzes,
--   tasks, materials, announcements and points; "content" into site (website drafts, student projects)
--   and forms. Older lists that name "students" or "content" still mean every part of them, so nobody
--   loses anything. Anyone with any training part can see the student list (names and groups), since
--   attendance, quizzes and tasks all need it; only "roster" can add or change students.

create or replace function private.member_can(p_role public.staff_role, p_perms text[], p_area text) returns boolean
language sql immutable set search_path = ''
as $$
  with granted as (
    select x from unnest(coalesce(p_perms, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])) as g(a),
      lateral unnest(case g.a
        when 'students' then array['roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points']
        when 'content' then array['site', 'forms']
        else array[g.a] end) as x
  )
  select p_role = 'owner'
      or (p_role = 'admin' and p_perms is null)
      or case p_area
           when 'training' then exists (select 1 from granted where x in ('roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points'))
           when 'access' then false
           else exists (select 1 from granted
                         where x = case p_area when 'report' then 'security' when 'students' then 'roster' when 'content' then 'site' else p_area end)
         end
$$;
revoke execute on function private.member_can(public.staff_role, text[], text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────── tables
alter policy announcements_staff_select on public.announcements using ((select private.can('announcements')));
alter policy announcements_staff_insert on public.announcements with check ((select private.can('announcements')));
alter policy announcements_staff_update on public.announcements using ((select private.can('announcements'))) with check ((select private.can('announcements')));
alter policy announcements_staff_delete on public.announcements using ((select private.can('announcements')));

alter policy assignments_staff_select on public.assignments using ((select private.can('tasks')));
alter policy assignments_staff_insert on public.assignments with check ((select private.can('tasks')));
alter policy assignments_staff_update on public.assignments using ((select private.can('tasks'))) with check ((select private.can('tasks')));
alter policy assignments_staff_delete on public.assignments using ((select private.can('tasks')));
alter policy submissions_staff_select on public.assignment_submissions using ((select private.can('tasks')));

alter policy attendance_select on public.attendance using ((select private.can('attendance')));
alter policy attendance_insert on public.attendance with check ((select private.can('attendance')));
alter policy attendance_update on public.attendance using ((select private.can('attendance'))) with check ((select private.can('attendance')));
alter policy attendance_delete on public.attendance using ((select private.can('attendance')));
alter policy sessions_select on public.attendance_sessions using ((select private.can('attendance')));
alter policy sessions_insert on public.attendance_sessions with check ((select private.can('attendance')));
alter policy sessions_update on public.attendance_sessions using ((select private.can('attendance'))) with check ((select private.can('attendance')));
alter policy sessions_delete on public.attendance_sessions
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('attendance'))));

alter policy materials_select on public.materials using ((select private.can('materials')));
alter policy materials_insert on public.materials with check ((select private.can('materials')));
alter policy materials_update on public.materials using ((select private.can('materials'))) with check ((select private.can('materials')));
alter policy materials_delete on public.materials
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('materials'))));
alter policy material_views_select on public.material_views using ((select private.can('training')));

alter policy quizzes_select on public.quizzes using ((select private.can('quizzes')));
alter policy quizzes_insert on public.quizzes with check ((select private.can('quizzes')));
alter policy quizzes_update on public.quizzes using ((select private.can('quizzes'))) with check ((select private.can('quizzes')));
alter policy quizzes_delete on public.quizzes
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('quizzes'))));
alter policy questions_select on public.quiz_questions using ((select private.can('quizzes')));
alter policy questions_insert on public.quiz_questions with check ((select private.can('quizzes')));
alter policy questions_update on public.quiz_questions using ((select private.can('quizzes'))) with check ((select private.can('quizzes')));
alter policy questions_delete on public.quiz_questions using ((select private.can('quizzes')));
alter policy attempts_select on public.quiz_attempts using ((select private.can('quizzes')));
alter policy attempts_delete on public.quiz_attempts using ((select private.can('quizzes')));

alter policy student_bonus_select on public.student_bonus using ((select private.can('points')));
alter policy student_bonus_insert on public.student_bonus with check ((select private.can('points')));

alter policy students_select on public.students using ((select private.can('training')));
alter policy students_insert on public.students with check ((select private.can('roster')));
alter policy students_update on public.students using ((select private.can('roster'))) with check ((select private.can('roster')));

alter policy access_requests_select on public.access_requests
  using ((kind = 'pin' and (select private.can('roster'))) or (kind = 'password' and (select private.is_admin())));

alter policy forms_staff_all on public.forms using ((select private.can('forms'))) with check ((select private.can('forms')));
alter policy responses_staff_select on public.form_responses using ((select private.can('forms')));
alter policy responses_staff_update on public.form_responses using ((select private.can('forms'))) with check ((select private.can('forms')));

alter policy site_content_select on public.site_content
  using ((published and (publish_at is null or publish_at <= now())) or (select private.can('site')));
alter policy site_content_insert on public.site_content with check ((select private.can('site')));
alter policy site_content_update on public.site_content using ((select private.can('site'))) with check ((select private.can('site')));
alter policy site_content_delete on public.site_content
  using ((select private.is_admin()) or (select private.can('publish')) or ((select private.can('site')) and not published and created_by = (select auth.uid())));
alter policy student_projects_select on public.student_projects using ((select private.can('site')));

-- ─────────────────────────────────────────────────────────── files
alter policy materials_objects_select on storage.objects using (bucket_id = 'materials' and (select private.can('materials')));
alter policy materials_objects_insert on storage.objects with check (bucket_id = 'materials' and (select private.can('materials')));
alter policy materials_objects_update on storage.objects using (bucket_id = 'materials' and (select private.can('materials')));
alter policy materials_objects_delete on storage.objects using (bucket_id = 'materials' and (select private.can('materials')));
alter policy submissions_objects_select on storage.objects
  using (bucket_id = 'submissions' and ((select private.can('tasks')) or ((select private.can('site')) and name like 'projects/%')));
alter policy site_objects_insert on storage.objects
  with check (bucket_id = 'site' and ((select private.is_admin()) or ((select private.can('site')) and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy site_objects_update on storage.objects
  using (bucket_id = 'site' and ((select private.is_admin()) or ((select private.can('site')) and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- ─────────────────────────────────────────────────────────── functions
select private.patch_function('public.attendance_scan(uuid, text, timestamp with time zone, text)', $p$private.can('students')$p$, $p$private.can('attendance')$p$);
select private.patch_function('public.staff_checkin_qr(uuid)', $p$private.can('students')$p$, $p$private.can('attendance')$p$);
select private.patch_function('public.staff_checkin_stop(uuid)', $p$private.can('students')$p$, $p$private.can('attendance')$p$);
select private.patch_function('public.staff_attendance_data(text)', $p$private.can('students')$p$, $p$private.can('attendance')$p$);
select private.patch_function('public.staff_access_requests()', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_access_resolve(uuid, text)', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_at_risk(text)', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_set_pins(uuid[], boolean)', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_sign_out_student(uuid)', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_unlock_student(uuid)', $p$private.can('students')$p$, $p$private.can('roster')$p$);
select private.patch_function('public.staff_student_report(uuid, date, date)', $p$private.can('students')$p$, $p$private.can('training')$p$);
select private.patch_function('public.staff_list_students()', $p$private.can('students')$p$, $p$private.can('training')$p$);
select private.patch_function('public.staff_grade_submission(uuid, numeric, text)', $p$private.can('students')$p$, $p$private.can('tasks')$p$);
select private.patch_function('public.staff_leaderboard(text)', $p$private.can('students')$p$, $p$private.can('training')$p$);
select private.patch_function('public.staff_regrade_quiz(uuid)', $p$private.can('students')$p$, $p$private.can('quizzes')$p$);
select private.patch_function('public.staff_attendance_rates(text)', $p$private.can('students')$p$, $p$private.can('training')$p$);
select private.patch_function('public.staff_progress(text)', $p$private.can('students')$p$, $p$private.can('training')$p$);
select private.patch_function('public.staff_review_project(uuid, text, text, uuid)', $p$private.can('content')$p$, $p$private.can('site')$p$);
select private.patch_function('public.staff_student_projects()', $p$private.can('content')$p$, $p$private.can('site')$p$);
-- The weekly contest table belongs with quizzes (it checked the website content area by mistake).
select private.patch_function('public.staff_contest(uuid)', $p$private.can('content')$p$, $p$private.can('quizzes')$p$);
