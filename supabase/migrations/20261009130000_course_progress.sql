-- Course progress: how far each student is through their group's track, from three parts that each
-- count the same: lectures and files opened, quizzes taken, sessions attended (closed sessions since
-- they joined). A part with nothing in it yet doesn't count. The student sees a progress bar; the team
-- sees everyone's progress when giving certificates.

create table public.material_views (
  material_id uuid not null references public.materials (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  first_at timestamptz not null default now(),
  primary key (material_id, student_id)
);
create index material_views_student_idx on public.material_views (student_id);
alter table public.material_views enable row level security;
create policy material_views_select on public.material_views for select to authenticated
  using ((select private.can('content')) or (select private.can('students')));
grant select on public.material_views to authenticated;
revoke all on public.material_views from anon;

/** Student: they opened a lecture or file (once is enough). */
create or replace function public.student_material_seen(p_token text, p_material uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  insert into public.material_views (material_id, student_id)
  select m.id, v_id from public.materials m join public.students s on s.id = v_id
   where m.id = p_material and m.published and (m.group_name = '' or m.group_name = s.group_name)
  on conflict do nothing;
end $$;
revoke execute on function public.student_material_seen(text, uuid) from public;
grant execute on function public.student_material_seen(text, uuid) to anon, authenticated;

create or replace function private.progress_table(p_group text default null) returns table (
  student_id uuid, materials int, seen int, quizzes int, quizzes_done int, sessions int, attended int, percent int
)
language sql stable security definer set search_path = ''
as $$
  with st as (
    select id, group_name, created_at from public.students where active and (p_group is null or p_group = '' or group_name = p_group)
  ), m as (
    select st.id as student_id, count(mt.id) as total, count(v.material_id) as seen
      from st join public.materials mt on mt.published and (mt.group_name = '' or mt.group_name = st.group_name)
      left join public.material_views v on v.material_id = mt.id and v.student_id = st.id
     group by st.id
  ), q as (
    select st.id as student_id, count(qz.id) as total,
           count(qz.id) filter (where exists (select 1 from public.quiz_attempts a where a.quiz_id = qz.id and a.student_id = st.id and a.submitted_at is not null)) as done
      from st join public.quizzes qz on qz.published and (qz.group_name = '' or qz.group_name = st.group_name) and (qz.opens_at is null or qz.opens_at <= now())
     group by st.id
  ), s as (
    select st.id as student_id, count(se.id) as total,
           count(a.session_id) filter (where a.status in ('present', 'late')) as came
      from st join public.attendance_sessions se on se.closed_at is not null and (se.group_name = '' or se.group_name = st.group_name)
                                                 and se.starts_at >= st.created_at - interval '1 day'
      left join public.attendance a on a.session_id = se.id and a.student_id = st.id
     group by st.id
  )
  select st.id, coalesce(m.total, 0)::int, coalesce(m.seen, 0)::int, coalesce(q.total, 0)::int, coalesce(q.done, 0)::int,
         coalesce(s.total, 0)::int, coalesce(s.came, 0)::int,
         coalesce(round(100 * (
           coalesce(m.seen::numeric / nullif(m.total, 0), 0) + coalesce(q.done::numeric / nullif(q.total, 0), 0) + coalesce(s.came::numeric / nullif(s.total, 0), 0)
         ) / nullif((coalesce(m.total, 0) > 0)::int + (coalesce(q.total, 0) > 0)::int + (coalesce(s.total, 0) > 0)::int, 0)), 0)::int
    from st left join m on m.student_id = st.id left join q on q.student_id = st.id left join s on s.student_id = st.id
$$;
revoke execute on function private.progress_table(text) from public, anon, authenticated;

/** Student: their progress, and which lectures and files they already opened. */
create or replace function public.student_progress(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
  v_out jsonb;
begin
  select group_name into v_group from public.students where id = v_id;
  select jsonb_build_object('percent', p.percent,
           'materials', jsonb_build_object('seen', p.seen, 'total', p.materials),
           'quizzes', jsonb_build_object('done', p.quizzes_done, 'total', p.quizzes),
           'sessions', jsonb_build_object('attended', p.attended, 'total', p.sessions),
           'seenIds', coalesce((select jsonb_agg(material_id) from public.material_views where student_id = v_id), '[]'::jsonb))
    into v_out
    from private.progress_table(v_group) p where p.student_id = v_id;
  return v_out;
end $$;
revoke execute on function public.student_progress(text) from public;
grant execute on function public.student_progress(text) to anon, authenticated;

/** Staff: everyone's progress (one group or all). */
create or replace function public.staff_progress(p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.can('students') or private.can('certificates')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(p)) from private.progress_table(p_group) p), '[]'::jsonb);
end $$;
revoke execute on function public.staff_progress(text) from public, anon;
grant execute on function public.staff_progress(text) to authenticated;
