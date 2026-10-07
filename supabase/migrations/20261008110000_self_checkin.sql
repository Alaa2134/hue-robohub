-- Students check themselves in: the coach shows a QR on the projector that changes every 30 seconds,
-- students scan it in the BuildX HUE app. The code is an HMAC of the session and the 30-second window
-- with a per-session secret, so a photo of it sent to someone at home stops working within a minute.

alter table public.attendance drop constraint attendance_method_check;
alter table public.attendance add constraint attendance_method_check check (method in ('scan', 'manual', 'self'));
alter table public.attendance_sessions add column self_checkin boolean not null default false;

create table private.session_keys (
  session_id uuid primary key references public.attendance_sessions (id) on delete cascade,
  secret bytea not null default extensions.gen_random_bytes(32)
);

create or replace function private.checkin_code(p_session uuid, p_window bigint) returns text
language sql stable security definer set search_path = ''
as $$
  select left(encode(extensions.hmac(convert_to(p_session::text || ':' || p_window, 'UTF8'), k.secret, 'sha256'), 'hex'), 12)
    from private.session_keys k where k.session_id = p_session
$$;

/** Staff: the code to show right now (and turns self check-in on for the session). Call every window. */
create or replace function public.staff_checkin_qr(p_session uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_now double precision := extract(epoch from clock_timestamp());
  v_window bigint := floor(v_now / 30);
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_s from public.attendance_sessions where id = p_session;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  if v_s.closed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  insert into private.session_keys (session_id) values (p_session) on conflict do nothing;
  if not v_s.self_checkin then
    update public.attendance_sessions set self_checkin = true where id = p_session;
  end if;
  return jsonb_build_object(
    'ok', true, 'window', v_window, 'code', private.checkin_code(p_session, v_window),
    'next_in', ((v_window + 1) * 30 - v_now),
    'count', (select count(*) from public.attendance where session_id = p_session));
end $$;

/** Staff: stop accepting self check-ins for a session. */
create or replace function public.staff_checkin_stop(p_session uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.attendance_sessions set self_checkin = false where id = p_session;
end $$;

/** A student checks in with the code from the projector (this window or the one before). */
create or replace function public.student_self_checkin(p_token text, p_session uuid, p_window bigint, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_st public.students%rowtype;
  v_s public.attendance_sessions%rowtype;
  v_window bigint := floor(extract(epoch from clock_timestamp()) / 30);
  v_row public.attendance%rowtype;
begin
  if not private.throttle('self_checkin', 30, interval '10 minutes') then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  select * into v_s from public.attendance_sessions where id = p_session;
  if not found then
    return jsonb_build_object('result', 'no_session');
  end if;
  if v_s.closed_at is not null or not v_s.self_checkin then
    return jsonb_build_object('result', 'closed', 'title', v_s.title);
  end if;
  if p_window is null or p_window not in (v_window, v_window - 1) then
    return jsonb_build_object('result', 'expired', 'title', v_s.title);
  end if;
  if p_code is null or p_code <> private.checkin_code(p_session, p_window) then
    perform private.log_security('self_checkin_bad_code', 1, jsonb_build_object('session', p_session));
    return jsonb_build_object('result', 'invalid', 'title', v_s.title);
  end if;
  select * into v_st from public.students where id = v_id;
  if v_s.group_name <> '' and v_st.group_name <> v_s.group_name then
    return jsonb_build_object('result', 'wrong_group', 'title', v_s.title, 'group', v_s.group_name);
  end if;
  insert into public.attendance (session_id, student_id, status, method, marked_at, marked_by)
  values (p_session, v_id,
          case when now() > v_s.starts_at + make_interval(mins => v_s.late_after_min) then 'late' else 'present' end::public.attendance_status,
          'self', now(), null)
  on conflict (session_id, student_id) do nothing
  returning * into v_row;
  if v_row.student_id is null then
    select * into v_row from public.attendance where session_id = p_session and student_id = v_id;
    return jsonb_build_object('result', 'already', 'title', v_s.title, 'status', v_row.status, 'at', v_row.marked_at);
  end if;
  return jsonb_build_object('result', 'marked', 'title', v_s.title, 'status', v_row.status, 'at', v_row.marked_at);
end $$;

revoke execute on function private.checkin_code(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.staff_checkin_qr(uuid), public.staff_checkin_stop(uuid), public.student_self_checkin(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.staff_checkin_qr(uuid), public.staff_checkin_stop(uuid) to authenticated;
grant execute on function public.student_self_checkin(text, uuid, bigint, text) to anon, authenticated;
