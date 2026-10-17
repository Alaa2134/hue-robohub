-- Attendance from an ordinary form: whoever registers gets a QR to keep on their phone, and the team
-- scans it at each session the form sets. A session can be for everyone or only for those who picked
-- a given answer (e.g. «Group A» or «Saturday»), so absences count only for the people it's for.
--
-- forms.attendance = {"on": true, "by": "<question id>", "sessions": [{"id": "s_ab12", "name": "…", "at": "…", "only": "<answer>"}]}

alter table public.forms add column if not exists attendance jsonb;
alter table public.forms add constraint forms_attendance_check
  check (attendance is null or (jsonb_typeof(attendance) = 'object' and octet_length(attendance::text) <= 20000));

alter table public.form_responses add column if not exists pass text;
alter table public.form_responses add constraint form_responses_pass_check check (pass ~ '^[0-9A-F]{16}$');
create unique index if not exists form_responses_pass_key on public.form_responses (pass);

-- Marked present (or taken back to absent: the row stays, so who changed it shows in the log).
create table if not exists public.form_attendance (
  response_id uuid not null references public.form_responses (id) on delete cascade,
  session text not null check (session ~ '^[a-z0-9_]{1,24}$'),
  present boolean not null default true,
  at timestamptz not null default now(),
  by uuid,
  method text not null default 'qr' check (method in ('qr', 'manual')),
  primary key (response_id, session)
);
alter table public.form_attendance enable row level security;
create policy form_attendance_read on public.form_attendance for select to authenticated using ((select private.can_read('forms')));
revoke all on public.form_attendance from anon, authenticated;
grant select on public.form_attendance to authenticated;
create or replace trigger audit_all after insert or update or delete on public.form_attendance
  for each row execute function private.audit();

-- The form's sessions (one called «الحضور» when none were added), and whether one is for a response.
create or replace function private.form_sessions(a jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(a -> 'sessions') = 'array' and jsonb_array_length(a -> 'sessions') > 0 then a -> 'sessions'
              else '[{"id": "main", "name": "الحضور"}]'::jsonb end
$$;

create or replace function private.form_session_for(a jsonb, s jsonb, answers jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(s ->> 'only', '') = '' or coalesce(a ->> 'by', '') = ''
      or answers -> (a ->> 'by') = to_jsonb(s ->> 'only')
      or (jsonb_typeof(answers -> (a ->> 'by')) = 'array' and (answers -> (a ->> 'by')) ? (s ->> 'only'))
$$;

-- Every response to a form with attendance gets its QR code (also the ones sent before it was turned on).
create or replace function private.form_pass_new()
returns text language sql volatile set search_path = '' as $$
  select upper(encode(extensions.gen_random_bytes(8), 'hex'))
$$;

create or replace function private.form_response_pass()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pass is null and exists (select 1 from public.forms f where f.id = new.form_id and coalesce((f.attendance ->> 'on')::boolean, false)) then
    new.pass := private.form_pass_new();
  end if;
  return new;
end $$;
create or replace trigger form_responses_pass before insert on public.form_responses
  for each row execute function private.form_response_pass();

create or replace function private.form_attendance_on()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.attendance ->> 'on')::boolean, false) then
    update public.form_responses set pass = private.form_pass_new() where form_id = new.id and pass is null;
  end if;
  return null;
end $$;
create or replace trigger forms_attendance_on after insert or update of attendance on public.forms
  for each row execute function private.form_attendance_on();

revoke all on function private.form_sessions(jsonb) from public, anon, authenticated;
revoke all on function private.form_session_for(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.form_pass_new() from public, anon, authenticated;

-- Sending the form hands back the QR code; checking the status with code + phone shows it again.
select private.patch_function('public.submit_form(text,jsonb,text,text)',
  $p$  v_files text[] := '{}';$p$,
  $p$  v_files text[] := '{}';
  v_pass text;$p$);
select private.patch_function('public.submit_form(text,jsonb,text,text)',
  $p$  returning ref into v_text;$p$,
  $p$  returning ref, pass into v_text, v_pass;$p$);
select private.patch_function('public.submit_form(text,jsonb,text,text)',
  $p$  return jsonb_build_object('ok', true, 'ref', v_text);$p$,
  $p$  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'ref', v_text, 'pass', v_pass));$p$);
select private.patch_function('public.form_status(text,text)',
  $p$      'meet_ar', nullif(f.delegation ->> 'meet_ar', '')) end);$p$,
  $p$      'meet_ar', nullif(f.delegation ->> 'meet_ar', '')) end,
    'attend_pass', case when coalesce((f.attendance ->> 'on')::boolean, false) and r.status <> 'rejected' then r.pass end);$p$);

-- The QR's own page: the form, the name and which sessions they came to (anyone holding the code).
create or replace function public.form_pass(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_pass', 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from public.form_responses where pass = upper(btrim(coalesce(p_token, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into f from public.forms where id = r.form_id;
  if not coalesce((f.attendance ->> 'on')::boolean, false) or f.archived then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'pass', r.pass, 'ref', r.ref, 'name', r.name, 'status', r.status,
    'title_ar', f.title_ar, 'title_en', f.title_en,
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', s ->> 'id', 'name', s ->> 'name', 'at', nullif(s ->> 'at', ''),
                                                              'here', coalesce(a.present, false), 'here_at', case when a.present then a.at end)
                                           order by n), '[]')
                   from jsonb_array_elements(private.form_sessions(f.attendance)) with ordinality x(s, n)
                   left join public.form_attendance a on a.response_id = r.id and a.session = s ->> 'id'
                  where private.form_session_for(f.attendance, s, r.answers)));
end $$;
revoke all on function public.form_pass(text) from public;
grant execute on function public.form_pass(text) to anon, authenticated;

-- The team marks someone present by scanning their QR (or typing their code), or by hand from the list;
-- p_present = false takes it back.
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

-- In the leader's activity log, an attendance mark names the person.
create or replace function private.audit_ctx(r jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o jsonb := '{}';
  v text;
  s text;
begin
  if r ->> 'student_id' is not null then
    select full_name into v from public.students where id = (r ->> 'student_id')::uuid;
    o := o || jsonb_build_object('st', v);
  end if;
  s := coalesce(r ->> 'staff_id', r ->> 'staff_user_id');
  if s is not null then
    select coalesce(nullif(full_name, ''), email) into v from public.staff where user_id = s::uuid;
    o := o || jsonb_build_object('sf', v);
  end if;
  v := case
    when r ->> 'response_id' is not null then (select coalesce(fr.name, fr.ref) || ' — ' || fo.title_ar from public.form_responses fr
                                                 join public.forms fo on fo.id = fr.form_id where fr.id = (r ->> 'response_id')::uuid)
    when r ->> 'quiz_id' is not null then (select title from public.quizzes where id = (r ->> 'quiz_id')::uuid)
    when r ->> 'assignment_id' is not null then (select title from public.assignments where id = (r ->> 'assignment_id')::uuid)
    when r ->> 'session_id' is not null then (select title from public.attendance_sessions where id = (r ->> 'session_id')::uuid)
    when r ->> 'task_id' is not null then (select title from public.staff_tasks where id = (r ->> 'task_id')::uuid)
    when r ->> 'item_id' is not null then (select name from public.inventory_items where id = (r ->> 'item_id')::uuid)
    when r ->> 'form_id' is not null then (select title_ar from public.forms where id = (r ->> 'form_id')::uuid)
    when r ->> 'event_id' is not null then (select coalesce(title_ar, title) from public.site_content where id = (r ->> 'event_id')::uuid)
    when r ->> 'meeting_id' is not null then (select title from public.sector_meetings where id = (r ->> 'meeting_id')::uuid)
    when r ->> 'material_id' is not null then (select title from public.materials where id = (r ->> 'material_id')::uuid)
    when r ->> 'page_id' is not null then (select title_ar from public.site_pages where id = (r ->> 'page_id')::uuid)
    when r ->> 'profile_id' is not null then (select full_name from public.team_profiles where id = (r ->> 'profile_id')::uuid)
    when r ->> 'sector_id' is not null then (select name from public.sectors where id = (r ->> 'sector_id')::uuid)
  end;
  if v is not null then
    o := o || jsonb_build_object('of', left(v, 160));
  end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(o) where value <> 'null'::jsonb);
exception when others then
  return o;
end $$;
revoke all on function private.audit_ctx(jsonb) from public, anon, authenticated;
