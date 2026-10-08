-- Per-person permissions in the BuildX App. Each staff member gets a position title (shown in the
-- team list, e.g. "مسؤول الميديا") and, for trainers (role lead), the areas they may work in:
--   applications  join applications and the waitlist
--   students      students, attendance, tasks, quizzes, materials, announcements, points
--   events        event registrations, door check-in, feedback
--   content       website content and forms
--   inbox         contact and sponsorship messages
--   certificates  certificates
-- Owners and admins keep everything. A trainer with no list (null) keeps every trainer area, as
-- before. The database enforces it (row-level policies and the staff functions), not just the app.
-- Only the owner can change someone's title or areas (staff_guard). Policies are altered in place.

alter table public.staff
  add column if not exists title text check (char_length(title) <= 80),
  add column if not exists permissions text[] check (permissions <@ array['applications', 'students', 'events', 'content', 'inbox', 'certificates']);

/** May the signed-in staff member work in this area (two-factor done where required)? */
create or replace function private.can(p_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.active
       and (s.role in ('owner', 'admin') or s.permissions is null or p_area = any(s.permissions))
  )
$$;
revoke execute on function private.can(text) from public, anon;
grant execute on function private.can(text) to authenticated;

-- Only the owner sets titles and areas.
select private.patch_function('private.staff_guard()',
  $p$if new.role <> old.role or new.active <> old.active or new.email <> old.email or new.user_id <> old.user_id then$p$,
  $p$if new.role <> old.role or new.active <> old.active or new.email <> old.email or new.user_id <> old.user_id
       or new.permissions is distinct from old.permissions or new.title is distinct from old.title then$p$);

-- Row-level policies: "is staff" becomes "may work in this area".
alter policy announcements_staff_delete on public.announcements using ((select private.can('students')));
alter policy announcements_staff_insert on public.announcements with check ((select private.can('students')));
alter policy announcements_staff_select on public.announcements using ((select private.can('students')));
alter policy announcements_staff_update on public.announcements using ((select private.can('students'))) with check ((select private.can('students')));
alter policy applications_select on public.applications using ((select private.can('applications')));
alter policy applications_update on public.applications using ((select private.can('applications'))) with check ((select private.can('applications')));
alter policy submissions_staff_select on public.assignment_submissions using ((select private.can('students')));
alter policy assignments_staff_delete on public.assignments using ((select private.can('students')));
alter policy assignments_staff_insert on public.assignments with check ((select private.can('students')));
alter policy assignments_staff_select on public.assignments using ((select private.can('students')));
alter policy assignments_staff_update on public.assignments using ((select private.can('students'))) with check ((select private.can('students')));
alter policy attendance_delete on public.attendance using ((select private.can('students')));
alter policy attendance_insert on public.attendance with check ((select private.can('students')));
alter policy attendance_select on public.attendance using ((select private.can('students')));
alter policy attendance_update on public.attendance using ((select private.can('students'))) with check ((select private.can('students')));
alter policy sessions_insert on public.attendance_sessions with check ((select private.can('students')));
alter policy sessions_select on public.attendance_sessions using ((select private.can('students')));
alter policy sessions_update on public.attendance_sessions using ((select private.can('students'))) with check ((select private.can('students')));
alter policy certificates_insert on public.certificates with check ((select private.can('certificates')));
alter policy certificates_select on public.certificates using ((select private.can('certificates')));
alter policy event_feedback_staff_select on public.event_feedback using ((select private.can('events')));
alter policy event_feedback_staff_update on public.event_feedback using ((select private.can('events'))) with check ((select private.can('events')));
alter policy event_registrations_select on public.event_registrations using ((select private.can('events')));
alter policy event_registrations_update on public.event_registrations using ((select private.can('events'))) with check ((select private.can('events')));
alter policy responses_staff_select on public.form_responses using ((select private.can('content')));
alter policy responses_staff_update on public.form_responses using ((select private.can('content'))) with check ((select private.can('content')));
alter policy forms_staff_all on public.forms using ((select private.can('content'))) with check ((select private.can('content')));
alter policy inbox_staff_select on public.inbox_messages using ((select private.can('inbox')));
alter policy inbox_staff_update on public.inbox_messages using ((select private.can('inbox'))) with check ((select private.can('inbox')));
alter policy materials_insert on public.materials with check ((select private.can('students')));
alter policy materials_select on public.materials using ((select private.can('students')));
alter policy materials_update on public.materials using ((select private.can('students'))) with check ((select private.can('students')));
alter policy attempts_delete on public.quiz_attempts using ((select private.can('students')));
alter policy attempts_select on public.quiz_attempts using ((select private.can('students')));
alter policy questions_delete on public.quiz_questions using ((select private.can('students')));
alter policy questions_insert on public.quiz_questions with check ((select private.can('students')));
alter policy questions_select on public.quiz_questions using ((select private.can('students')));
alter policy questions_update on public.quiz_questions using ((select private.can('students'))) with check ((select private.can('students')));
alter policy quizzes_insert on public.quizzes with check ((select private.can('students')));
alter policy quizzes_select on public.quizzes using ((select private.can('students')));
alter policy quizzes_update on public.quizzes using ((select private.can('students'))) with check ((select private.can('students')));
alter policy student_bonus_insert on public.student_bonus with check ((select private.can('students')));
alter policy student_bonus_select on public.student_bonus using ((select private.can('students')));
alter policy students_insert on public.students with check ((select private.can('students')));
alter policy students_select on public.students using ((select private.can('students')));
alter policy students_update on public.students using ((select private.can('students'))) with check ((select private.can('students')));
alter policy waitlist_staff_select on public.waitlist using ((select private.can('applications')));
alter policy waitlist_staff_update on public.waitlist using ((select private.can('applications'))) with check ((select private.can('applications')));
alter policy site_content_insert on public.site_content with check ((select private.can('content')));
alter policy site_content_update on public.site_content using ((select private.can('content'))) with check ((select private.can('content')));
alter policy site_content_select on public.site_content using ((published and (publish_at is null or publish_at <= now())) or (select private.can('content')));
alter policy site_content_delete on public.site_content using ((select private.is_admin()) or ((select private.can('content')) and not published and created_by = (select auth.uid())));
alter policy sessions_delete on public.attendance_sessions using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('students'))));
alter policy materials_delete on public.materials using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('students'))));
alter policy quizzes_delete on public.quizzes using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.can('students'))));

-- Files: course materials and student submissions belong to "students", website images to "content".
alter policy materials_objects_select on storage.objects using (bucket_id = 'materials' and (select private.can('students')));
alter policy materials_objects_insert on storage.objects with check (bucket_id = 'materials' and (select private.can('students')));
alter policy materials_objects_update on storage.objects using (bucket_id = 'materials' and (select private.can('students')));
alter policy materials_objects_delete on storage.objects using (bucket_id = 'materials' and (select private.can('students')));
alter policy submissions_objects_select on storage.objects using (bucket_id = 'submissions' and (select private.can('students')));
alter policy site_objects_insert on storage.objects with check (bucket_id = 'site' and ((select private.is_admin()) or ((select private.can('content')) and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy site_objects_update on storage.objects using (bucket_id = 'site' and ((select private.is_admin()) or ((select private.can('content')) and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- The staff functions behind the app screens check the same areas.
select private.patch_function('public.attendance_scan(uuid, text, timestamp with time zone, text)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_attendance_data(text)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_checkin_qr(uuid)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_checkin_stop(uuid)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_grade_submission(uuid, numeric, text)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_leaderboard(text)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_list_students()', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_regrade_quiz(uuid)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_set_pins(uuid[], boolean)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_sign_out_student(uuid)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_student_report(uuid, date, date)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_unlock_student(uuid)', 'private.is_staff()', 'private.can(''students'')');
select private.patch_function('public.staff_check_in(uuid, text)', 'private.is_staff()', 'private.can(''events'')');
