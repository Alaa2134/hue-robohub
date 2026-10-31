-- Who keeps registering and not coming: for each response, how many of the person's earlier events
-- (accepted, the event is over, attendance was taken) they missed, and how many they came to. The
-- responses screen shows it next to their name, so the team can put them on the waiting list.

create or replace function public.staff_form_links(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if not found then return '{}'::jsonb; end if;
  if not (private.can_read('forms') or (private.can_read('expo') and f.delegation is not null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(x.id, x.info) from (
      select r.id, jsonb_strip_nulls(jsonb_build_object(
        'forms', (select jsonb_agg(jsonb_build_object('title', f2.title_ar, 'status', o.status, 'at', o.created_at) order by o.created_at desc)
                    from public.form_responses o join public.forms f2 on f2.id = o.form_id
                   where o.form_id <> r.form_id
                     and ((r.phone is not null and o.phone = r.phone)
                       or (r.email is not null and o.email = r.email)
                       or (r.student_id is not null and o.student_id = r.student_id))),
        'member', (select jsonb_build_object('code', s.code, 'active', s.active and (s.member_until is null or s.member_until >= private.cairo_today()))
                     from public.students s
                    where s.id = r.student_id or (r.phone is not null and private.clean_phone(s.phone) = r.phone)
                    order by (s.id = r.student_id) desc, s.active desc limit 1),
        'application', (select jsonb_build_object('status', a.status, 'at', a.created_at)
                          from public.applications a
                         where (r.phone is not null and private.clean_phone(a.phone) = r.phone) or (r.email is not null and lower(a.email) = r.email)
                         order by a.created_at desc limit 1),
        -- Earlier events they were accepted to, now over, where attendance was taken: missed / came.
        'shows', (select case when count(*) > 0 then jsonb_build_object(
                           'missed', count(*) filter (where not o.came),
                           'came', count(*) filter (where o.came)) end
                    from (select exists (select 1 from public.form_attendance a where a.response_id = o.id and a.present and a.session not like 'bus\_%') as came
                            from public.form_responses o join public.forms f2 on f2.id = o.form_id
                           where o.form_id <> r.form_id and o.status = 'accepted'
                             and f2.event_at < now() - interval '6 hours'
                             and coalesce((f2.attendance ->> 'on')::boolean, false)
                             and exists (select 1 from public.form_attendance a2 join public.form_responses o2 on o2.id = a2.response_id
                                          where o2.form_id = f2.id and a2.present)
                             and ((r.phone is not null and o.phone = r.phone)
                               or (r.email is not null and o.email = r.email)
                               or (r.student_id is not null and o.student_id = r.student_id))) o)
      )) as info
      from public.form_responses r where r.form_id = p_form
    ) x where x.info <> '{}'::jsonb
  ), '{}'::jsonb);
end $$;
revoke all on function public.staff_form_links(uuid) from public, anon;
grant execute on function public.staff_form_links(uuid) to authenticated;
