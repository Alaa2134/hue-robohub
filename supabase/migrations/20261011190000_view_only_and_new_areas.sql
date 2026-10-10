-- Clearer permissions.
--  1. A "view only" level: next to an area ("forms") the owner can give "forms:view". That person sees
--     everything in the area (lists, details, reports) and can't add, change or remove anything. Every
--     read check (SELECT policies, read-only staff functions, file reads) accepts either level; every
--     write check still needs the full area.
--  2. New areas, split from the big ones: "pages" (the page builder, was part of "site"), "expo" (expo
--     delegations: the visit form, accepting, check-in, no-shows and bans; was part of "forms") and
--     "whatsapp" (the WhatsApp connection's message log and sending; connecting the account itself stays
--     with the owner and full admins). Whoever had "site" gets "pages" and whoever had "forms" gets
--     "expo", so nobody loses anything.
--  3. "voice" (Baqloz's voice) is now accepted when the owner saves it (the list of allowed names missed it).

-- ─────────────────────────────────────────────────────────────── names
/** Every allowed permission name, alone (full) or with ":view". */
create or replace function private.valid_permissions(p text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null or (cardinality(p) <= 80 and not exists (
    select 1 from unnest(p) e
     where e !~ '^(applications|students|events|content|inbox|certificates|publish|settings|portfolios|notify|security|roster|attendance|quizzes|tasks|materials|announcements|points|site|pages|forms|expo|sectors|inventory|voice|whatsapp)(:view)?$'))
$$;
revoke execute on function private.valid_permissions(text[]) from public, anon, authenticated;

alter table public.staff drop constraint if exists staff_permissions_check;
alter table public.staff add constraint staff_permissions_check check (private.valid_permissions(permissions));

-- ─────────────────────────────────────────────────────────────── full and view
/** Full access to an area. Older lists: "students" = every training part, "content" = site, forms, pages, expo. */
create or replace function private.member_can(p_role public.staff_role, p_perms text[], p_area text) returns boolean
language sql immutable set search_path = ''
as $$
  with granted as (
    select x from unnest(coalesce(p_perms, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])) as g(a),
      lateral unnest(case g.a
        when 'students' then array['roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points']
        when 'content' then array['site', 'forms', 'pages', 'expo']
        else array[g.a] end) as x
  )
  select p_role = 'owner'
      or (p_role = 'admin' and p_perms is null)
      or case p_area
           when 'training' then exists (select 1 from granted where x in ('roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points'))
           when 'access' then false
           else exists (select 1 from granted
                         where x = case p_area when 'report' then 'security' when 'students' then 'roster' when 'content' then 'site' else p_area end)
         end
$$;
revoke execute on function private.member_can(public.staff_role, text[], text) from public, anon, authenticated;

/** Seeing an area: full access, or the area given as "<area>:view". */
create or replace function private.member_can_read(p_role public.staff_role, p_perms text[], p_area text) returns boolean
language sql immutable set search_path = ''
as $$
  select private.member_can(p_role, p_perms, p_area)
      or (p_perms is not null and private.member_can('lead'::public.staff_role,
            array(select left(e, -5) from unnest(p_perms) e where e like '%:view'), p_area))
$$;
revoke execute on function private.member_can_read(public.staff_role, text[], text) from public, anon, authenticated;

create or replace function private.can_read(p_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.active and private.member_can_read(s.role, s.permissions, p_area)
  )
$$;
revoke execute on function private.can_read(text) from public, anon;
grant execute on function private.can_read(text) to authenticated;

-- Whoever had the bigger area keeps the part that was split out of it.
update public.staff set permissions = permissions || array['pages']
 where permissions is not null and 'site' = any(permissions) and not 'pages' = any(permissions);
update public.staff set permissions = permissions || array['expo']
 where permissions is not null and 'forms' = any(permissions) and not 'expo' = any(permissions);

-- ─────────────────────────────────────────────────────────────── every read accepts "view"
do $$
declare
  p record;
  f record;
begin
  -- Policies that only read (SELECT), on tables and on stored files.
  for p in select schemaname, tablename, policyname, qual from pg_policies
            where schemaname in ('public', 'storage') and cmd = 'SELECT' and qual ~ 'private\.can\(' loop
    execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename,
                   replace(p.qual, 'private.can(', 'private.can_read('));
  end loop;
  -- Staff functions that only read (stable): lists, reports, statistics.
  for f in select pr.oid::regprocedure as fn from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
            where n.nspname = 'public' and pr.provolatile = 's' and pr.prosrc ~ 'private\.can\(' loop
    perform private.patch_function(f.fn, 'private.can(', 'private.can_read(');
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────── pages
alter policy site_pages_select on public.site_pages using ((select private.can_read('pages')));
alter policy site_pages_insert on public.site_pages with check ((select private.can('pages')));
alter policy site_pages_update on public.site_pages using ((select private.can('pages'))) with check ((select private.can('pages')));
-- Pictures for pages go to the same place as the website's.
alter policy site_objects_insert on storage.objects with check (bucket_id = 'site' and ((select private.is_admin())
  or (((select private.can('site')) or (select private.can('pages'))) and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy site_objects_update on storage.objects using (bucket_id = 'site' and ((select private.is_admin())
  or (((select private.can('site')) or (select private.can('pages'))) and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- ─────────────────────────────────────────────────────────────── expo delegations
/** A delegation form (an expo visit). */
create or replace function private.is_delegation_form(p_form uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.forms where id = p_form and delegation is not null)
$$;
revoke execute on function private.is_delegation_form(uuid) from public, anon;
grant execute on function private.is_delegation_form(uuid) to authenticated;

-- Forms: "forms" keeps every form (the existing policy); "expo" works on delegation forms only.
create policy forms_staff_read on public.forms for select to authenticated
  using ((select private.can_read('forms')) or (delegation is not null and (select private.can_read('expo'))));
create policy forms_expo_update on public.forms for update to authenticated
  using (delegation is not null and (select private.can('expo')))
  with check (delegation is not null and (select private.can('expo')));

alter policy responses_staff_select on public.form_responses
  using ((select private.can_read('forms')) or ((select private.can_read('expo')) and private.is_delegation_form(form_id)));
alter policy responses_staff_update on public.form_responses
  using ((select private.can('forms')) or ((select private.can('expo')) and private.is_delegation_form(form_id)))
  with check ((select private.can('forms')) or ((select private.can('expo')) and private.is_delegation_form(form_id)));

alter policy community_bans_select on public.community_bans
  using ((select private.can_read('forms')) or (select private.can_read('expo')) or (select private.can_read('roster')));
alter policy community_bans_insert on public.community_bans
  with check ((select private.can('forms')) or (select private.can('expo')) or (select private.can('roster')));
alter policy community_bans_update on public.community_bans
  using ((select private.can('forms')) or (select private.can('expo')) or (select private.can('roster')))
  with check ((select private.can('forms')) or (select private.can('expo')) or (select private.can('roster')));

select private.patch_function('public.staff_delegation_no_shows(uuid, boolean)',
  $p$if not private.can('forms') then$p$, $p$if not (private.can('forms') or private.can('expo')) then$p$);
select private.patch_function('public.staff_lift_ban(uuid, boolean)',
  $p$if not (private.can('forms') or private.can('roster')) then$p$,
  $p$if not (private.can('forms') or private.can('expo') or private.can('roster')) then$p$);

-- ─────────────────────────────────────────────────────────────── who has what (for the owner's table)
/** The owner (or a full admin): every team member with what they can do, area by area. */
create or replace function public.staff_permission_matrix() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_areas text[] := array['roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points',
    'site', 'pages', 'publish', 'forms', 'expo', 'portfolios', 'settings', 'voice',
    'applications', 'events', 'inbox', 'certificates', 'notify', 'whatsapp', 'security', 'sectors', 'inventory'];
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', s.user_id, 'name', coalesce(nullif(s.full_name, ''), s.email), 'role', s.role, 'title', s.title,
             'full', s.role = 'owner' or (s.role = 'admin' and s.permissions is null),
             'areas', (select jsonb_object_agg(a, case when private.member_can(s.role, s.permissions, a) then 'full'
                                                       when private.member_can_read(s.role, s.permissions, a) then 'view'
                                                       else 'none' end)
                         from unnest(v_areas) a))
           order by case s.role when 'owner' then 0 when 'admin' then 1 else 2 end, s.full_name)
      from public.staff s where s.active), '[]'::jsonb);
end $$;
revoke execute on function public.staff_permission_matrix() from public, anon;
grant execute on function public.staff_permission_matrix() to authenticated;
