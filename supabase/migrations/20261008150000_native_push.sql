-- Push notifications in the store apps. Phones register a device token (FCM on Android, APNs on
-- iOS); send-push delivers to them next to the browser subscriptions. The FCM service account and
-- the APNs key go in private.app_secrets (inserted directly, never committed).

create table public.native_push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios')),
  app text not null check (app in ('student', 'staff')),
  student_id uuid references public.students (id) on delete cascade,
  staff_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index native_push_tokens_student_idx on public.native_push_tokens (student_id);
create index native_push_tokens_staff_idx on public.native_push_tokens (staff_id);
alter table public.native_push_tokens enable row level security;
create policy native_push_tokens_select on public.native_push_tokens for select to authenticated using ((select private.is_admin()));
grant select on public.native_push_tokens to authenticated;
revoke all on public.native_push_tokens from anon;

create or replace function public.push_native_student(p_token text, p_device text, p_platform text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  if not private.throttle('push_sub', 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into public.native_push_tokens (token, platform, app, student_id)
  values (p_device, p_platform, 'student', v_id)
  on conflict (token) do update set platform = excluded.platform, app = 'student', student_id = v_id, staff_id = null, updated_at = now(), disabled_at = null;
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create or replace function public.push_native_staff(p_device text, p_platform text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.native_push_tokens (token, platform, app, staff_id)
  values (p_device, p_platform, 'staff', auth.uid())
  on conflict (token) do update set platform = excluded.platform, app = 'staff', staff_id = auth.uid(), student_id = null, updated_at = now(), disabled_at = null;
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** Edge Function only: the store-app devices and keys for one message (same audience rules as web push). */
create or replace function public.push_native_targets(p_message uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'fcm', (select value from private.app_secrets where name = 'fcm_service_account'),
    'apns', jsonb_build_object(
      'key', (select value from private.app_secrets where name = 'apns_key_p8'),
      'key_id', (select value from private.app_secrets where name = 'apns_key_id'),
      'team_id', (select value from private.app_secrets where name = 'apns_team_id')),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('token', d.token, 'platform', d.platform, 'app', d.app))
        from public.native_push_tokens d
        left join public.students st on st.id = d.student_id
       where d.disabled_at is null
         and case m.audience
               when 'staff' then d.app = 'staff'
               when 'students' then d.app = 'student' and st.active
               when 'group' then d.app = 'student' and st.active and st.group_name = m.group_name
               else d.app = 'staff' or st.active
             end
    ), '[]'::jsonb))
  from public.push_messages m where m.id = p_message
$$;

/** Edge Function only: switch off tokens the push services say are gone. */
create or replace function public.push_native_gone(p_tokens text[]) returns void
language sql security definer set search_path = ''
as $$
  update public.native_push_tokens set disabled_at = now() where token = any (coalesce(p_tokens, '{}')) and disabled_at is null
$$;

revoke execute on function public.push_native_student(text, text, text), public.push_native_staff(text, text), public.push_native_targets(uuid), public.push_native_gone(text[]) from public, anon, authenticated;
grant execute on function public.push_native_student(text, text, text) to anon, authenticated;
grant execute on function public.push_native_staff(text, text) to authenticated;
grant execute on function public.push_native_targets(uuid), public.push_native_gone(text[]) to service_role;
