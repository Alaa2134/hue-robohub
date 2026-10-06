-- BuildX HUE — website content the team edits from the app: events, news, projects, gallery photos
-- and achievements, in one table. Any staff member can write drafts; only owners/admins publish.
-- Visitors read published rows only.

create type public.site_content_kind as enum ('event', 'post', 'project', 'photo', 'achievement');

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  kind public.site_content_kind not null,
  slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  title text not null default '' check (char_length(title) <= 160),
  title_ar text check (char_length(title_ar) <= 160),
  summary text check (char_length(summary) <= 600),
  summary_ar text check (char_length(summary_ar) <= 600),
  body text check (char_length(body) <= 8000),
  body_ar text check (char_length(body_ar) <= 8000),
  result text check (char_length(result) <= 200),
  result_ar text check (char_length(result_ar) <= 200),
  image_path text check (char_length(image_path) <= 300),
  url text check (url ~ '^https?://[^[:space:]]+$' and char_length(url) <= 300),
  starts_at timestamptz,
  ends_at timestamptz check (ends_at is null or starts_at is null or ends_at >= starts_at),
  location text check (char_length(location) <= 160),
  location_ar text check (char_length(location_ar) <= 160),
  track text check (char_length(track) <= 60),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  published boolean not null default false,
  pinned boolean not null default false,
  sort_order int not null default 100,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_content_list_idx on public.site_content (kind, published, starts_at desc, created_at desc);
create index site_content_created_by_idx on public.site_content (created_by);

-- Publishing is for owners/admins: everyone else writes drafts and can't touch published items.
create or replace function private.site_content_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.created_by := old.created_by;
  end if;
  if coalesce(auth.role(), '') = 'authenticated' and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.published := false;
      new.pinned := false;
      new.created_by := auth.uid();
    else
      if old.published then
        raise exception 'published_locked' using errcode = '42501', detail = 'Only owners and admins edit published content.';
      end if;
      new.published := false;
      new.pinned := old.pinned;
    end if;
  end if;
  return new;
end $$;

create trigger site_content_guard before insert or update on public.site_content
  for each row execute function private.site_content_guard();
create trigger site_content_audit after insert or delete on public.site_content
  for each row execute function private.audit();

alter table public.site_content enable row level security;
create policy site_content_public on public.site_content for select to anon using (published);
create policy site_content_select on public.site_content for select to authenticated
  using (published or (select private.is_staff()));
create policy site_content_insert on public.site_content for insert to authenticated with check ((select private.is_staff()));
create policy site_content_update on public.site_content for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy site_content_delete on public.site_content for delete to authenticated
  using ((select private.is_admin()) or ((select private.is_staff()) and not published and created_by = (select auth.uid())));

grant select on public.site_content to anon;
revoke insert, update, delete, truncate on public.site_content from anon;
revoke truncate on public.site_content from authenticated;
revoke execute on function private.site_content_guard() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── storage: website images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy site_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'site' and (select private.is_staff()));
create policy site_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
create policy site_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'site' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
create policy site_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site' and ((select private.is_admin()) or ((select private.is_staff()) and (storage.foldername(name))[1] = (select auth.uid())::text)));
