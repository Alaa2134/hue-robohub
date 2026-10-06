-- BuildX HUE — team portfolios shown on the website.
-- Each team member owns one profile (photo, bio, skills, links, projects) and edits it from the app.
-- Owners/admins create profiles for anyone, set the group (founder / lead / member) and the order.
-- Visitors read published profiles only; a profile with external_url links out instead of a page.

create type public.team_group as enum ('founder', 'lead', 'member');

create table public.team_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  full_name text not null check (char_length(full_name) between 2 and 80),
  full_name_ar text check (char_length(full_name_ar) <= 80),
  headline text not null default '' check (char_length(headline) <= 100),
  headline_ar text check (char_length(headline_ar) <= 100),
  bio text not null default '' check (char_length(bio) <= 1500),
  bio_ar text check (char_length(bio_ar) <= 1500),
  group_kind public.team_group not null default 'member',
  track text check (char_length(track) <= 60),
  photo_path text check (char_length(photo_path) <= 300),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  links jsonb not null default '{}' check (jsonb_typeof(links) = 'object'),
  external_url text check (external_url ~ '^https://[^[:space:]]+$' and char_length(external_url) <= 300),
  published boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index team_profiles_order_idx on public.team_profiles (group_kind, sort_order, full_name);

create table public.team_projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.team_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1500),
  image_path text check (char_length(image_path) <= 300),
  url text check (url ~ '^https?://[^[:space:]]+$' and char_length(url) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  year int check (year between 2000 and 2100),
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
create index team_projects_profile_idx on public.team_projects (profile_id, sort_order);

-- Only owners/admins move people between groups, reorder them or re-link accounts.
create or replace function private.team_profiles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  -- Signed-in non-admins only (migrations and service jobs run without a user).
  if coalesce(auth.role(), '') = 'authenticated' and not private.is_admin() then
    if tg_op = 'INSERT' then
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

create trigger team_profiles_guard before insert or update on public.team_profiles
  for each row execute function private.team_profiles_guard();
create trigger team_profiles_audit after insert or delete on public.team_profiles
  for each row execute function private.audit();

-- Can the signed-in user edit this profile? (an active staff member who owns it)
create or replace function private.owns_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and exists (select 1 from public.team_profiles where id = p_profile and user_id = auth.uid())
$$;

alter table public.team_profiles enable row level security;
alter table public.team_projects enable row level security;

create policy team_profiles_public on public.team_profiles for select to anon using (published);
create policy team_profiles_select on public.team_profiles for select to authenticated
  using (published or (select private.is_staff()));
create policy team_profiles_insert on public.team_profiles for insert to authenticated
  with check ((select private.is_admin()) or ((select private.is_staff()) and user_id = (select auth.uid())));
create policy team_profiles_update on public.team_profiles for update to authenticated
  using ((select private.is_admin()) or ((select private.is_staff()) and user_id = (select auth.uid())))
  with check ((select private.is_admin()) or ((select private.is_staff()) and user_id = (select auth.uid())));
create policy team_profiles_delete on public.team_profiles for delete to authenticated using ((select private.is_admin()));

create policy team_projects_public on public.team_projects for select to anon
  using (exists (select 1 from public.team_profiles p where p.id = profile_id and p.published));
create policy team_projects_select on public.team_projects for select to authenticated
  using ((select private.is_staff()) or exists (select 1 from public.team_profiles p where p.id = profile_id and p.published));
create policy team_projects_insert on public.team_projects for insert to authenticated
  with check ((select private.is_admin()) or private.owns_profile(profile_id));
create policy team_projects_update on public.team_projects for update to authenticated
  using ((select private.is_admin()) or private.owns_profile(profile_id))
  with check ((select private.is_admin()) or private.owns_profile(profile_id));
create policy team_projects_delete on public.team_projects for delete to authenticated
  using ((select private.is_admin()) or private.owns_profile(profile_id));

grant select on public.team_profiles, public.team_projects to anon;
revoke insert, update, delete, truncate on public.team_profiles, public.team_projects from anon;
revoke truncate on public.team_profiles, public.team_projects from authenticated;

revoke execute on function private.team_profiles_guard() from public, anon, authenticated;
revoke execute on function private.owns_profile(uuid) from public, anon;
grant execute on function private.owns_profile(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────── storage: team photos
-- Public read by URL; staff write only inside their own folder (<user id>/...), admins anywhere.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team', 'team', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy team_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'team' and (select private.is_staff()));
create policy team_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
create policy team_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'team' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
create policy team_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- ─────────────────────────────────────────────────────────────── founder whose portfolio lives elsewhere
insert into public.team_profiles (user_id, slug, full_name, full_name_ar, headline, headline_ar, group_kind, external_url, published, sort_order)
select s.user_id, 'alaa-saber', 'Alaa Saber', 'علاء صابر', 'Founder', 'المؤسس', 'founder', 'https://3laa.site', true, 0
from public.staff s
where lower(s.email) = 'alaa00saber@gmail.com'
on conflict do nothing;
