-- One student's report for a period (usually a month): attendance per session (missing = absent),
-- best quiz scores, tasks and grades, and points with their rank in the group. Staff turn it into a
-- PDF in the app to share with the student or their family.

create or replace function public.staff_student_report(p_student uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_st public.students%rowtype;
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_st from public.students where id = p_student;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'student', jsonb_build_object('name', v_st.full_name, 'code', v_st.code, 'group', v_st.group_name),
    'from', p_from, 'to', p_to,
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'at', s.starts_at, 'status', coalesce(a.status::text, 'absent')) order by s.starts_at)
        from public.attendance_sessions s
        left join public.attendance a on a.session_id = s.id and a.student_id = p_student
       where s.starts_at >= v_from and s.starts_at < v_to and s.starts_at < now()
         and (s.group_name = '' or s.group_name = v_st.group_name or a.student_id is not null)
    ), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object('title', q.title, 'score', b.score, 'max', b.max_score, 'at', b.at) order by b.at)
        from (
          select distinct on (quiz_id) quiz_id, score, max_score, submitted_at as at
            from public.quiz_attempts
           where student_id = p_student and submitted_at >= v_from and submitted_at < v_to and score is not null
           order by quiz_id, score desc
        ) b join public.quizzes q on q.id = b.quiz_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'max', t.max_points, 'due', t.due_at, 'submitted', s.submitted_at, 'late', s.late, 'grade', s.grade) order by coalesce(t.due_at, t.created_at))
        from public.assignments t
        left join public.assignment_submissions s on s.assignment_id = t.id and s.student_id = p_student
       where t.published and (t.group_name = '' or t.group_name = v_st.group_name)
         and coalesce(t.due_at, t.created_at) >= v_from and coalesce(t.due_at, t.created_at) < v_to
    ), '[]'::jsonb),
    'points', (
      select jsonb_build_object('points', me.points, 'rank', (select count(*) + 1 from private.student_scores() g where g.group_name = me.group_name and g.points > me.points),
        'of', (select count(*) from private.student_scores() g where g.group_name = me.group_name),
        'badges', to_jsonb(private.badges(me.attended, me.quizzes, me.perfect, me.certs, me.events, me.bonus)))
        from private.student_scores() me where me.student_id = p_student
    )
  );
end $$;

revoke execute on function public.staff_student_report(uuid, date, date) from public, anon;
grant execute on function public.staff_student_report(uuid, date, date) to authenticated;
