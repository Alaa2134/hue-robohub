-- BuildX AI Studio Pro (studio/): the studio's tables (studio/packages/server/src/schema.sql) and their
-- row-level security + private bucket (studio/db/supabase.sql).

-- BuildX AI Studio Pro — database schema (schema "studio"). Safe to run again: the API applies it on
-- start. On Supabase, db/supabase.sql adds row-level security and the private storage bucket on top.
-- Nothing here removes rows: a project or file taken out is marked (removed_at) and its files are
-- cleaned out of storage by the worker.

create schema if not exists studio;

-- Who can use the studio: admins (members, quotas, every project) and editors (their projects).
create table if not exists studio.members (
  email text primary key check (email = lower(email)),
  -- Filled in the first time this person signs in (an admin can add someone before that).
  user_id uuid unique,
  role text not null check (role in ('admin', 'editor')),
  active boolean not null default true,
  monthly_render_minutes integer,
  added_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists studio.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null,
  template text,
  -- The edit (packages/core/src/edl.ts). timeline_version goes up on every save; a save made from an
  -- older version is refused, so two tabs can't overwrite each other's work.
  timeline jsonb not null,
  timeline_version integer not null default 1,
  storage_quota_mb integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists projects_owner on studio.projects (owner_id) where removed_at is null;

create table if not exists studio.project_members (
  project_id uuid not null references studio.projects (id),
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (project_id, user_id)
);
create index if not exists project_members_user on studio.project_members (user_id);

-- Uploaded media. Facts about a file (duration, size, sound) come only from ffprobe in the worker.
create table if not exists studio.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references studio.projects (id),
  kind text not null check (kind in ('video', 'image', 'audio', 'font')),
  name text not null check (char_length(name) between 1 and 200),
  mime text not null,
  size bigint not null check (size >= 0),
  storage_key text not null unique,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'failed')),
  error text,
  duration double precision,
  width integer,
  height integer,
  fps double precision,
  has_audio boolean not null default false,
  codec text,
  thumb_key text,
  proxy_key text,
  waveform jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists assets_project on studio.assets (project_id, created_at) where removed_at is null;

-- Exports. Each keeps the exact timeline it rendered (a snapshot), so a retry renders the same edit.
create table if not exists studio.renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references studio.projects (id),
  created_by uuid not null,
  status text not null default 'queued' check (status in ('queued', 'rendering', 'uploading', 'done', 'failed', 'cancelled')),
  cancel_requested boolean not null default false,
  progress real not null default 0 check (progress between 0 and 1),
  settings jsonb not null,
  timeline jsonb not null,
  timeline_version integer not null,
  duration double precision not null,
  estimate jsonb,
  output_key text,
  output_size bigint,
  error text,
  attempt integer not null default 1,
  retry_of uuid references studio.renders (id),
  cpu_seconds double precision,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  removed_at timestamptz
);
create index if not exists renders_project on studio.renders (project_id, created_at desc);
create index if not exists renders_user_month on studio.renders (created_by, created_at) where status in ('queued', 'rendering', 'uploading', 'done');

-- Everything that costs money or quota, for the monthly limits (renders, AI calls).
create table if not exists studio.usage (
  id bigserial primary key,
  user_id uuid not null,
  project_id uuid,
  kind text not null check (kind in ('render', 'ai')),
  amount double precision not null,
  unit text not null check (unit in ('seconds', 'usd')),
  ref uuid,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_month on studio.usage (user_id, kind, created_at);

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
