-- One person across the join application, the family list and the app: records are tied by the
-- student account, or by the phone number when there's no account yet. The team sees one card per
-- person, each part only to those whose permission covers it (no national ID or address on it).

/** A family-list entry with no account yet takes the account that has the same phone number (only one). */
create or replace function private.family_link_student() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  if new.student_id is null and new.phone is not null then
    select case when count(*) = 1 then min(s.id::text)::uuid end into v
      from public.students s where private.phone_key(s.phone) = private.phone_key(new.phone);
    new.student_id := v;
  end if;
  return new;
end $$;
create or replace trigger family_members_link before insert or update of phone, student_id on public.family_members
  for each row execute function private.family_link_student();

-- The ones already there.
update public.family_members f set student_id = x.id
  from (select f2.id fid, min(s.id::text)::uuid id
          from public.family_members f2 join public.students s on private.phone_key(s.phone) = private.phone_key(f2.phone)
         where f2.student_id is null and f2.phone is not null
         group by f2.id having count(*) = 1) x
 where f.id = x.fid;

/** Everything about one person, by account or phone: each part only for the permission that covers it. */
create or replace function public.staff_person(p_student uuid default null, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  st public.students;
  v_key text;
begin
  if not private.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_student is not null then
    select * into st from public.students where id = p_student;
  end if;
  v_key := private.phone_key(coalesce(st.phone, p_phone));
  if st.id is null and v_key is null then return null; end if;
  if st.id is null then
    select * into st from public.students s where private.phone_key(s.phone) = v_key order by s.active desc, s.created_at desc limit 1;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'student', case when st.id is not null and private.can_read('roster') then jsonb_build_object(
      'id', st.id, 'code', st.code, 'name', st.full_name, 'group', st.group_name, 'active', st.active, 'member_until', st.member_until) end,
    'applications', case when private.can_read('applications') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ref', a.ref, 'status', a.status, 'track', a.track_first, 'at', a.created_at,
                                                   'family_ready', a.national_id is not null and a.address is not null) order by a.created_at desc), '[]')
        from public.applications a
       where (st.id is not null and a.student_id = st.id) or (v_key is not null and private.phone_key(a.phone) = v_key)) end,
    'family', case when private.can_read('applications') then (
      select coalesce(jsonb_agg(jsonb_build_object('ref', f.ref, 'year', f.academic_year, 'status', f.status, 'level', f.level) order by f.academic_year desc), '[]')
        from public.family_members f
       where (st.id is not null and f.student_id = st.id) or (v_key is not null and private.phone_key(f.phone) = v_key)) end,
    'forms', case when private.can_read('forms') then (
      select coalesce(jsonb_agg(jsonb_build_object('form', fo.id, 'title', fo.title_ar, 'ref', r.ref, 'status', r.status, 'paid', r.paid_at is not null, 'at', r.created_at) order by r.created_at desc), '[]')
        from public.form_responses r join public.forms fo on fo.id = r.form_id
       where (st.id is not null and r.student_id = st.id) or (v_key is not null and private.phone_key(r.phone) = v_key)) end,
    'events', case when private.can_read('events') then (
      select coalesce(jsonb_agg(jsonb_build_object('event', c.id, 'title', coalesce(nullif(c.title_ar, ''), c.title), 'status', e.status, 'inside', e.checked_in_at is not null, 'at', e.created_at) order by e.created_at desc), '[]')
        from public.event_registrations e join public.site_content c on c.id = e.event_id
       where v_key is not null and private.phone_key(e.phone) = v_key) end,
    'strikes', (
      select coalesce(jsonb_agg(jsonb_build_object('outcome', k.outcome, 'what', k.reason, 'at', k.created_at, 'lifted', k.lifted_at is not null) order by k.created_at desc), '[]')
        from public.community_strikes k
       where (st.id is not null and k.student_id = st.id) or (v_key is not null and private.phone_key(k.phone) = v_key))
  ));
end $$;
revoke all on function public.staff_person(uuid, text) from public, anon;
grant execute on function public.staff_person(uuid, text) to authenticated;
