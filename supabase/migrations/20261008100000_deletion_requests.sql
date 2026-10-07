-- Account deletion from inside the apps (App Store / Google Play rule). Students and team members ask
-- for it in their account screen; the owner sees the requests in the dashboard and carries them out
-- (students: the student and everything tied to them is deleted; team members: through staff-admin)
-- or declines them. Accounts are issued by the community, so a person can't delete one on their own.

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('student', 'staff')),
  student_id uuid references public.students (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  name text not null default '' check (char_length(name) <= 120),
  identifier text not null default '' check (char_length(identifier) <= 200),
  reason text not null default '' check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null
);
create unique index deletion_requests_student_pending_idx on public.deletion_requests (student_id) where status = 'pending';
create unique index deletion_requests_user_pending_idx on public.deletion_requests (user_id) where status = 'pending';
create index deletion_requests_status_idx on public.deletion_requests (status, created_at desc);
create index deletion_requests_handled_by_idx on public.deletion_requests (handled_by);
alter table public.deletion_requests enable row level security;
create policy deletion_requests_select on public.deletion_requests for select to authenticated using ((select private.is_owner()));
grant select on public.deletion_requests to authenticated;
revoke all on public.deletion_requests from anon;

/** A student asks for their account to be deleted (or sees the request they already sent). */
create or replace function public.student_request_deletion(p_token text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_row public.deletion_requests%rowtype;
begin
  select * into v_row from public.deletion_requests where student_id = v_id and status = 'pending';
  if found then
    return jsonb_build_object('ok', true, 'at', v_row.created_at);
  end if;
  if not private.throttle('deletion_request', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into public.deletion_requests (kind, student_id, name, identifier, reason)
  select 'student', s.id, s.full_name, s.code, left(btrim(coalesce(p_reason, '')), 500) from public.students s where s.id = v_id
  returning * into v_row;
  return jsonb_build_object('ok', true, 'at', v_row.created_at);
end $$;

-- Not stable: session_student refreshes the session's last-seen time.
create or replace function public.student_deletion_status(p_token text) returns jsonb
language sql security definer set search_path = ''
as $$
  select coalesce((select jsonb_build_object('pending', true, 'at', created_at) from public.deletion_requests
                    where student_id = private.session_student(p_token) and status = 'pending'), jsonb_build_object('pending', false))
$$;

/** A team member asks for their own account to be deleted. The owner's account can't be. */
create or replace function public.staff_request_deletion(p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_row public.deletion_requests%rowtype;
begin
  select * into v_staff from public.staff where user_id = auth.uid();
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_staff.role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner');
  end if;
  select * into v_row from public.deletion_requests where user_id = v_staff.user_id and status = 'pending';
  if not found then
    insert into public.deletion_requests (kind, user_id, name, identifier, reason)
    values ('staff', v_staff.user_id, v_staff.full_name, v_staff.email, left(btrim(coalesce(p_reason, '')), 500))
    returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'at', v_row.created_at);
end $$;

create or replace function public.staff_deletion_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_build_object('pending', true, 'at', created_at) from public.deletion_requests
                    where user_id = auth.uid() and status = 'pending'), jsonb_build_object('pending', false))
$$;

/**
 * Owner: carry out or decline a request. Carrying out a student request deletes the student, which
 * removes their sign-in, sessions, attendance, quiz attempts, points and devices (certificates stay
 * on record without the link). Team members are deleted through staff-admin first; this then only
 * closes the request.
 */
create or replace function public.staff_resolve_deletion(p_request uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.deletion_requests%rowtype;
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.deletion_requests where id = p_request and status = 'pending' for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_approve and v_row.kind = 'student' and v_row.student_id is not null then
    delete from public.students where id = v_row.student_id;
  end if;
  if p_approve and v_row.kind = 'staff' and exists (select 1 from public.staff where user_id = v_row.user_id) then
    return jsonb_build_object('ok', false, 'error', 'staff_still_exists');
  end if;
  update public.deletion_requests
     set status = case when p_approve then 'done' else 'rejected' end, handled_at = now(), handled_by = auth.uid(),
         -- Nothing personal is kept once the account is gone.
         name = case when p_approve then '' else name end,
         identifier = case when p_approve then '' else identifier end,
         reason = case when p_approve then '' else reason end
   where id = v_row.id;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()),
          case when p_approve then 'account_deleted' else 'deletion_declined' end, v_row.kind, coalesce(v_row.student_id, v_row.user_id)::text,
          jsonb_build_object('request', v_row.id));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.student_request_deletion(text, text), public.student_deletion_status(text), public.staff_request_deletion(text),
  public.staff_deletion_status(), public.staff_resolve_deletion(uuid, boolean) from public, anon, authenticated;
grant execute on function public.student_request_deletion(text, text), public.student_deletion_status(text) to anon, authenticated;
grant execute on function public.staff_request_deletion(text), public.staff_deletion_status(), public.staff_resolve_deletion(uuid, boolean) to authenticated;
