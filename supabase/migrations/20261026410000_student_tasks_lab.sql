-- The student app's task list marks Lab tasks, so it sends the student to the Lab to do and submit them.
select private.patch_function('public.student_tasks(text)',
  $p$'maxPoints', a.max_points, 'allowLate', a.allow_late,$p$,
  $p$'maxPoints', a.max_points, 'allowLate', a.allow_late, 'lab', a.lab_challenge is not null or a.lab_template is not null,$p$);
