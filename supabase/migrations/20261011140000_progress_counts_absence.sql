-- Course progress counted a student who never came as finished: attendance only counted once a
-- session was closed by hand, and a part with nothing in it didn't count at all. So a group whose
-- sessions were never closed (or hadn't started yet) was judged on files and quizzes alone: open
-- them all and it read 100%, "finished the track", with zero sessions attended.
-- Now attendance always counts as one of the three parts (no sessions attended = 0 for that part,
-- so files and quizzes alone top out at 67%, under the 80% "finished" mark), and a session counts
-- as held once it's closed or started more than 12 hours ago, the same rule the student's own
-- attendance list uses (it shows them absent from then). Follow-ups and streaks use the same rule.

select private.patch_function('private.progress_table(text)',
  $p$se.closed_at is not null and (se.group_name$p$,
  $p$(se.closed_at is not null or se.starts_at < now() - interval '12 hours') and (se.group_name$p$);

select private.patch_function('private.progress_table(text)',
  $p$+ (coalesce(s.total, 0) > 0)::int, 0)$p$,
  $p$+ 1, 0)$p$);

select private.patch_function('private.at_risk(text)',
  $p$se.closed_at is not null and (se.group_name$p$,
  $p$(se.closed_at is not null or se.starts_at < now() - interval '12 hours') and (se.group_name$p$);

select private.patch_function('private.streaks(uuid)',
  $p$se.closed_at is not null and (se.group_name$p$,
  $p$(se.closed_at is not null or se.starts_at < now() - interval '12 hours') and (se.group_name$p$);
