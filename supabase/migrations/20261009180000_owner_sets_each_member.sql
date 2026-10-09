-- The owner decides what each team member sees and works in, admins included.
--   Before: an admin always had everything; only trainers had a list of areas.
--   Now: an admin with no list keeps everything (team, deletes, security…), exactly as before; once the
--   owner gives an admin a list, that admin has those areas only, like a trainer. Nobody changes until
--   the owner edits them.
--   New area "security": the security screen and IP blocking, the activity log, site visits, site
--   errors and plan usage. Site-down reports go to whoever has it.

create or replace function private.member_can(p_role public.staff_role, p_perms text[], p_area text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_role = 'owner'
      or (p_role = 'admin' and p_perms is null)
      or coalesce((case p_area when 'report' then 'security' when 'access' then null else p_area end)
                  = any(coalesce(p_perms, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])), false)
$$;
revoke execute on function private.member_can(public.staff_role, text[], text) from public, anon, authenticated;

create or replace function private.can(p_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.active and private.member_can(s.role, s.permissions, p_area)
  )
$$;

-- "Admin" powers (team, deletes, admin-only settings) belong to the owner and to admins without a list.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff
                  where user_id = auth.uid() and active and (role = 'owner' or (role = 'admin' and permissions is null)))
     and private.mfa_ok()
$$;

-- The staff-admin Edge Function manages accounts by this answer: an admin with a list counts as a trainer.
create or replace function public.staff_whoami() returns text
language sql stable security definer set search_path = ''
as $$
  select case when s.role = 'admin' and s.permissions is not null then 'lead' else s.role::text end
    from public.staff s where s.user_id = auth.uid() and s.active and private.mfa_ok()
$$;

-- Notifications for an area reach the same people (web push and phones).
select private.patch_function('public.push_targets(uuid)', $p$x.role in ('owner', 'admin')$p$, $p$private.member_can(x.role, x.permissions, m.area)$p$);
select private.patch_function('public.push_native_targets(uuid)', $p$x.role in ('owner', 'admin')$p$, $p$private.member_can(x.role, x.permissions, m.area)$p$);

-- The "security" area.
select private.patch_function('public.staff_security_overview(integer)', 'if not private.is_admin() then', $p$if not (private.is_admin() or private.can('security')) then$p$);
select private.patch_function('public.staff_block_ip(text, integer, text)', 'if not private.is_admin() then', $p$if not (private.is_admin() or private.can('security')) then$p$);
select private.patch_function('public.staff_unblock_ip(text)', 'if not private.is_admin() then', $p$if not (private.is_admin() or private.can('security')) then$p$);
select private.patch_function('public.staff_usage()', 'if not private.is_admin() then', $p$if not (private.is_admin() or private.can('security')) then$p$);
select private.patch_function('public.staff_guide_usage()', 'if not private.is_admin() then', $p$if not (private.is_admin() or private.can('security')) then$p$);
select private.patch_function('public.staff_site_stats(integer)', 'if not private.is_staff() then', $p$if not private.can('security') then$p$);
select private.patch_function('public.staff_client_errors(integer)', 'if not private.is_staff() then', $p$if not private.can('security') then$p$);
select private.patch_function('public.staff_resolve_client_error(bigint)', 'if not private.is_staff() then', $p$if not private.can('security') then$p$);
alter policy audit_select on public.audit_log using ((select private.is_admin()) or (select private.can('security')));
