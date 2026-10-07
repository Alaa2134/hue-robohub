-- Two-factor sign-in for staff (authenticator app codes, Supabase Auth TOTP).
--
-- Once a staff member has a verified authenticator, every staff permission needs a session that
-- passed the code check (aal2): a stolen password alone no longer opens the dashboard or the data.
-- Owners/admins can also require two-factor for the whole team (site_settings key "security",
-- {"require_2fa": true}); then staff without an authenticator only get as far as setting one up.

create or replace function private.mfa_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (
        not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
        and coalesce((select (s.value ->> 'require_2fa')::boolean from public.site_settings s where s.key = 'security'), false) is false
      )
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active) and private.mfa_ok()
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active and role in ('owner', 'admin')) and private.mfa_ok()
$$;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active and role = 'owner') and private.mfa_ok()
$$;

/** Which staff members have two-factor turned on (owners/admins). */
create or replace function public.staff_mfa_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'require', coalesce((select (value ->> 'require_2fa')::boolean from public.site_settings where key = 'security'), false),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'name', coalesce(nullif(s.full_name, ''), s.email),
        'role', s.role,
        'factors', (select count(*) from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified')
      ) order by s.role, s.full_name)
      from public.staff s where s.active
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function private.mfa_ok() from public, anon, authenticated;
revoke execute on function public.staff_mfa_overview() from public, anon;
grant execute on function public.staff_mfa_overview() to authenticated;
