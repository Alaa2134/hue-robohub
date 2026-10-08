-- "Forgot my PIN / password" from the sign-in screen. Whoever forgot types their student number or
-- email; the team gets a notification and a list, and gives a new PIN (students: anyone who handles
-- students) or a new temporary password (team: owners and admins). No email is needed.
-- The answer never says whether the number or email exists.

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pin', 'password')),
  student_id uuid references public.students (id) on delete cascade,
  staff_user_id uuid references auth.users (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'done', 'declined')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  constraint access_requests_who check ((kind = 'pin' and student_id is not null and staff_user_id is null) or (kind = 'password' and staff_user_id is not null and student_id is null))
);
create unique index access_requests_one_pending_student on public.access_requests (student_id) where status = 'pending';
create unique index access_requests_one_pending_staff on public.access_requests (staff_user_id) where status = 'pending';
create index access_requests_status_idx on public.access_requests (status, created_at desc);
create index access_requests_handled_by_idx on public.access_requests (handled_by);
alter table public.access_requests enable row level security;
create policy access_requests_select on public.access_requests for select to authenticated
  using ((kind = 'pin' and (select private.can('students'))) or (kind = 'password' and (select private.is_admin())));
grant select on public.access_requests to authenticated;
revoke all on public.access_requests from anon;

/** Anyone (sign-in screen): ask the team for a new PIN or password. Always answers ok. */
create or replace function public.request_access_help(p_ident text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ident text := btrim(coalesce(p_ident, ''));
  v_student uuid;
  v_staff uuid;
  v_name text;
begin
  if char_length(v_ident) < 2 or char_length(v_ident) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('access_help', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if position('@' in v_ident) > 0 then
    select user_id, full_name into v_staff, v_name from public.staff where lower(email) = lower(v_ident) and active;
    if v_staff is not null then
      insert into public.access_requests (kind, staff_user_id, note) values ('password', v_staff, left(btrim(coalesce(p_note, '')), 200))
      on conflict do nothing;
      if found then
        perform private.notify_staff('access', 'نسي كلمة المرور 🔑', v_name, '/app/#/staff/access');
      end if;
    end if;
  else
    select id, full_name into v_student, v_name from public.students where code_key = private.code_key(v_ident) and active;
    if v_student is not null then
      insert into public.access_requests (kind, student_id, note) values ('pin', v_student, left(btrim(coalesce(p_note, '')), 200))
      on conflict do nothing;
      if found then
        perform private.notify_staff('students', 'طالب نسي رمز الدخول 🔑', v_name, '/app/#/staff/access');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.request_access_help(text, text) from public;
grant execute on function public.request_access_help(text, text) to anon, authenticated;

/** Staff: the pending requests they can answer, with who asked. */
create or replace function public.staff_access_requests() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'note', r.note, 'at', r.created_at,
      'studentId', r.student_id, 'staffUserId', r.staff_user_id,
      'name', coalesce(st.full_name, x.full_name), 'code', st.code, 'group', st.group_name, 'email', x.email, 'phone', st.phone)
      order by r.created_at), '[]'::jsonb)
    from public.access_requests r
    left join public.students st on st.id = r.student_id
    left join public.staff x on x.user_id = r.staff_user_id
   where r.status = 'pending'
     and ((r.kind = 'pin' and private.can('students')) or (r.kind = 'password' and private.is_admin()))
$$;
revoke execute on function public.staff_access_requests() from public, anon;
grant execute on function public.staff_access_requests() to authenticated;

/** Staff: mark a request done (after giving the new PIN or password) or declined. */
create or replace function public.staff_access_resolve(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.access_requests where id = p_id and status = 'pending';
  if v_kind is null then
    return;
  end if;
  if p_status not in ('done', 'declined') or not ((v_kind = 'pin' and private.can('students')) or (v_kind = 'password' and private.is_admin())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.access_requests set status = p_status, handled_by = auth.uid(), handled_at = now() where id = p_id;
end $$;
revoke execute on function public.staff_access_resolve(uuid, text) from public, anon;
grant execute on function public.staff_access_resolve(uuid, text) to authenticated;

-- Done and declined requests are kept 90 days.
create or replace function private.access_requests_cleanup() returns void
language sql security definer set search_path = ''
as $$
  delete from public.access_requests where status <> 'pending' and handled_at < now() - interval '90 days'
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'buildx-access-requests-cleanup';
select cron.schedule('buildx-access-requests-cleanup', '23 3 * * *', $$select private.access_requests_cleanup()$$);
