-- Each active student's attendance so far (sessions they came to, on time or late, out of the
-- sessions held for their group), for the certificates screen: "issue to everyone who attended at
-- least 75%". Same counting as the student report. Staff with students or certificates only.
create or replace function public.staff_attendance_rates(p_group text default null)
returns table (student_id uuid, attended int, sessions int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.can('students') or private.can('certificates')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select st.id,
           count(*) filter (where a.status in ('present', 'late'))::int,
           count(s.id)::int
      from public.students st
      left join public.attendance_sessions s
        on s.starts_at < now()
       and (s.group_name = '' or s.group_name = st.group_name
            or exists (select 1 from public.attendance x where x.session_id = s.id and x.student_id = st.id))
      left join public.attendance a on a.session_id = s.id and a.student_id = st.id
     where st.active and (p_group is null or st.group_name = p_group)
     group by st.id;
end $$;
revoke execute on function public.staff_attendance_rates(text) from public, anon;
grant execute on function public.staff_attendance_rates(text) to authenticated;
