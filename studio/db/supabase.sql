-- BuildX AI Studio Pro on Supabase: row-level security for the studio tables, and the private
-- "studio" bucket. Run after packages/server/src/schema.sql (the API also applies that on start).
--
-- The API and the worker connect as the database owner and do their own checks (who may touch which
-- project). These policies are the second wall: the studio tables are not exposed to the browser at
-- all (schema "studio" is not in the Data API, and anon/authenticated get no grants); if that ever
-- changed, people would still see only their own projects. In storage, a signed-in member can only
-- upload the one file the API reserved for them (status "uploading", their own id, that exact path).
-- Nobody reads the bucket directly: files are read through short-lived signed links.

alter table studio.members enable row level security;
alter table studio.projects enable row level security;
alter table studio.project_members enable row level security;
alter table studio.assets enable row level security;
alter table studio.renders enable row level security;
alter table studio.usage enable row level security;

revoke all on all tables in schema studio from anon, authenticated;
revoke all on all sequences in schema studio from anon, authenticated;
revoke usage on schema studio from anon, authenticated;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'members' and policyname = 'members_self') then
    create policy members_self on studio.members for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $p$;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'projects' and policyname = 'projects_own') then
    create policy projects_own on studio.projects for select to authenticated
  using (owner_id = (select auth.uid()) or exists (select 1 from studio.project_members m where m.project_id = id and m.user_id = (select auth.uid())));
  end if;
end $p$;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'project_members' and policyname = 'project_members_own') then
    create policy project_members_own on studio.project_members for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $p$;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'assets' and policyname = 'assets_own') then
    create policy assets_own on studio.assets for select to authenticated
  using (exists (select 1 from studio.project_members m where m.project_id = assets.project_id and m.user_id = (select auth.uid())));
  end if;
end $p$;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'renders' and policyname = 'renders_own') then
    create policy renders_own on studio.renders for select to authenticated
  using (exists (select 1 from studio.project_members m where m.project_id = renders.project_id and m.user_id = (select auth.uid())));
  end if;
end $p$;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'usage' and policyname = 'usage_own') then
    create policy usage_own on studio.usage for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $p$;

-- May this person upload this object now? Only the file the API reserved for them.
create or replace function private.studio_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from studio.assets a
      join studio.members m on m.user_id = (select auth.uid()) and m.active
     where a.storage_key = p_name and a.status = 'uploading' and a.created_by = (select auth.uid()) and a.removed_at is null
  )
$$;
revoke all on function private.studio_can_upload(text) from public, anon;
grant execute on function private.studio_can_upload(text) to authenticated;

insert into storage.buckets (id, name, public) values ('studio', 'studio', false) on conflict (id) do nothing;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'studio_upload_reserved') then
    create policy studio_upload_reserved on storage.objects for insert to authenticated
  with check (bucket_id = 'studio' and (select private.studio_can_upload(name)));
  end if;
end $p$;
