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
