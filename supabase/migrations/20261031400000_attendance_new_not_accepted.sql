-- Attendance: on a form whose responses the team reviews (anyone accepted or on the waiting list), a
-- "new" response hasn't been reviewed yet, so it isn't accepted: the scan stops and says so, like the
-- waiting list; the organizer can still let them in (p_force). A form nobody reviews (everyone still
-- "new") lets everyone in as before. The app counts people the same way (src/lib/attendance-people.ts).

create or replace function public.staff_form_mark(p_form uuid, p_session text, p_code text default null, p_response uuid default null,
                                                  p_present boolean default true, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  r public.form_responses;
  s jsonb;
  v text := upper(btrim(coalesce(p_code, '')));
  v_was boolean;
  v_at timestamptz;
begin
  if not private.can('forms') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.forms where id = p_form;
  if not found or not coalesce((f.attendance ->> 'on')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'off');
  end if;
  select x into s from jsonb_array_elements(private.form_sessions(f.attendance)) x where x ->> 'id' = p_session;
  if s is null then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  if p_response is not null then
    select * into r from public.form_responses where id = p_response;
  elsif v ~ 'PASS=[0-9A-F]{16}' then
    select * into r from public.form_responses where pass = substring(v from 'PASS=([0-9A-F]{16})');
  elsif v ~ '^[0-9A-F]{16}$' then
    select * into r from public.form_responses where pass = v;
  elsif v ~ 'F-[0-9A-F]{8}' then
    select * into r from public.form_responses where ref = substring(v from '(F-[0-9A-F]{8})');
  end if;
  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.form_id <> f.id then
    return jsonb_build_object('ok', false, 'error', 'other_form', 'name', r.name, 'form', (select title_ar from public.forms where id = r.form_id));
  end if;
  -- On a form the team reviews (anyone accepted or waiting), "new" means not reviewed yet: not accepted.
  if p_present and not p_force and (r.status::text in ('waiting', 'rejected')
      or (r.status::text = 'new' and exists (select 1 from public.form_responses x where x.form_id = f.id and x.status::text in ('accepted', 'waiting')))) then
    return jsonb_build_object('ok', false, 'error', 'not_accepted', 'id', r.id, 'name', r.name, 'ref', r.ref, 'status', r.status);
  end if;
  if p_present and not p_force and not private.form_session_for(f.attendance, s, r.answers) then
    return jsonb_build_object('ok', false, 'error', 'not_this_session', 'id', r.id, 'name', r.name, 'ref', r.ref,
                              'answer', r.answers -> (f.attendance ->> 'by'));
  end if;
  select present, at into v_was, v_at from public.form_attendance where response_id = r.id and session = p_session;
  if p_present and coalesce(v_was, false) then
    return jsonb_build_object('ok', true, 'already', true, 'id', r.id, 'name', r.name, 'ref', r.ref, 'status', r.status, 'at', v_at);
  end if;
  insert into public.form_attendance (response_id, session, present, at, by, method)
  values (r.id, p_session, p_present, now(), auth.uid(), case when p_response is null then 'qr' else 'manual' end)
  on conflict (response_id, session) do update
    set present = excluded.present, at = excluded.at, by = excluded.by, method = excluded.method;
  return jsonb_build_object('ok', true, 'id', r.id, 'name', r.name, 'ref', r.ref, 'status', r.status, 'present', p_present, 'at', now());
end $$;

revoke all on function public.staff_form_mark(uuid, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.staff_form_mark(uuid, text, text, uuid, boolean, boolean) to authenticated;
