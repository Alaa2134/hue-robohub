-- Permissions for the website admin and the head of media. Four more areas a trainer (role lead)
-- can be given, for work that so far only owners and admins could do:
--   publish     publish on the website: publish, unpublish and pin posts, events, projects and
--               photos, edit published ones and delete them (others write drafts)
--   settings    website settings: contact details, banner, goals, sponsorship deck, app versions
--               (not the security settings)
--   portfolios  the team's pages: edit any member's portfolio, add members, order the team page
--   notify      send push notifications to students or the team
-- A trainer with no list (null) keeps exactly the areas they had (the first six); the new ones are
-- only given by name. Owners and admins keep everything. Enforced here, not just in the app.

alter table public.staff drop constraint if exists staff_permissions_check;
alter table public.staff add constraint staff_permissions_check
  check (permissions <@ array['applications', 'students', 'events', 'content', 'inbox', 'certificates', 'publish', 'settings', 'portfolios', 'notify']);

create or replace function private.can(p_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.active
       and (s.role in ('owner', 'admin')
            or p_area = any(coalesce(s.permissions, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])))
  )
$$;

-- Publishing: the content guard lets publishers do what admins do.
select private.patch_function('private.site_content_guard()',
  $p$if coalesce(auth.role(), '') = 'authenticated' and not private.is_admin() then$p$,
  $p$if coalesce(auth.role(), '') = 'authenticated' and not (private.is_admin() or private.can('publish')) then$p$);
alter policy site_content_delete on public.site_content
  using ((select private.is_admin()) or (select private.can('publish')) or ((select private.can('content')) and not published and created_by = (select auth.uid())));

-- Website settings (only these keys; security, applications intake, the AI guide and the hall of
-- fame stay with owners and admins).
alter policy site_settings_insert on public.site_settings
  with check ((select private.is_admin()) or ((select private.can('settings')) and key in ('site', 'apps', 'sponsorship')));
alter policy site_settings_update on public.site_settings
  using ((select private.is_admin()) or ((select private.can('settings')) and key in ('site', 'apps', 'sponsorship')))
  with check ((select private.is_admin()) or ((select private.can('settings')) and key in ('site', 'apps', 'sponsorship')));

-- The team's pages: portfolio managers edit everyone's page and its order, but can't move a page
-- to another account.
create or replace function private.team_profiles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if coalesce(auth.role(), '') = 'authenticated' and not private.is_admin() then
    if private.can('portfolios') then
      if tg_op = 'INSERT' then
        new.user_id := case when new.user_id = auth.uid() then new.user_id end;
      else
        new.user_id := old.user_id;
      end if;
    elsif tg_op = 'INSERT' then
      new.group_kind := 'member';
      new.sort_order := 100;
      new.user_id := auth.uid();
    else
      new.group_kind := old.group_kind;
      new.sort_order := old.sort_order;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end $$;
alter policy team_profiles_insert on public.team_profiles
  with check ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and user_id = (select auth.uid())));
alter policy team_profiles_update on public.team_profiles
  using ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and user_id = (select auth.uid())))
  with check ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and user_id = (select auth.uid())));
alter policy team_profiles_delete on public.team_profiles
  using ((select private.is_admin()) or (select private.can('portfolios')));
alter policy team_projects_insert on public.team_projects
  with check ((select private.is_admin()) or (select private.can('portfolios')) or private.owns_profile(profile_id));
alter policy team_projects_update on public.team_projects
  using ((select private.is_admin()) or (select private.can('portfolios')) or private.owns_profile(profile_id))
  with check ((select private.is_admin()) or (select private.can('portfolios')) or private.owns_profile(profile_id));
alter policy team_projects_delete on public.team_projects
  using ((select private.is_admin()) or (select private.can('portfolios')) or private.owns_profile(profile_id));
alter policy team_objects_insert on storage.objects
  with check (bucket_id = 'team' and ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy team_objects_update on storage.objects
  using (bucket_id = 'team' and ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy team_objects_delete on storage.objects
  using (bucket_id = 'team' and ((select private.is_admin()) or (select private.can('portfolios')) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- Notifications.
select private.patch_function('public.staff_push_create(text, text, text, text, text)',
  $p$if not private.is_admin() then$p$,
  $p$if not (private.is_admin() or private.can('notify')) then$p$);
alter policy push_subscriptions_select on public.push_subscriptions
  using ((select private.is_admin()) or (select private.can('notify')));
