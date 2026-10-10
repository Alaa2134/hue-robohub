-- Team rules set by the owner, deadline extensions and excuses, and appeals against warnings.
--   Rules: how many active warnings (in how many days) alert the overseers, how long before a deadline
--   the reminder goes out, a grace period after it, and whether a missed deadline warns automatically.
--   A member asks for more time or to be excused (before or after the deadline); a head of the sector
--   decides. An approved extension gives that member their own deadline (and cancels the automatic
--   warning if it was already given). A member can appeal a warning once; the overseers decide, and an
--   accepted appeal cancels the warning.

create table public.team_settings (
  id boolean primary key default true check (id),
  warn_threshold int not null default 3 check (warn_threshold between 1 and 20),
  warn_window_days int not null default 90 check (warn_window_days between 7 and 365),
  remind_hours int not null default 24 check (remind_hours between 1 and 168),
  grace_minutes int not null default 0 check (grace_minutes between 0 and 1440),
  auto_warn boolean not null default true,
  meeting_absence_warn boolean not null default false,
  weekly_report boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.team_settings (id) values (true) on conflict do nothing;
alter table public.team_settings enable row level security;
revoke all on public.team_settings from anon, authenticated;
create trigger team_settings_audit after update on public.team_settings for each row execute function private.audit();

create or replace function private.team_rules() returns public.team_settings
language sql stable security definer set search_path = ''
as $$ select * from public.team_settings where id $$;
revoke execute on function private.team_rules() from public, anon, authenticated;

/** The team rules (every team member may read them). */
create or replace function public.staff_team_settings() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return to_jsonb(private.team_rules()) - 'id' - 'updated_by';
end $$;

/** Overseers: change the team rules. */
create or replace function public.staff_team_settings_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.team_settings set
    warn_threshold = coalesce((p ->> 'warn_threshold')::int, warn_threshold),
    warn_window_days = coalesce((p ->> 'warn_window_days')::int, warn_window_days),
    remind_hours = coalesce((p ->> 'remind_hours')::int, remind_hours),
    grace_minutes = coalesce((p ->> 'grace_minutes')::int, grace_minutes),
    auto_warn = coalesce((p ->> 'auto_warn')::boolean, auto_warn),
    meeting_absence_warn = coalesce((p ->> 'meeting_absence_warn')::boolean, meeting_absence_warn),
    weekly_report = coalesce((p ->> 'weekly_report')::boolean, weekly_report),
    updated_at = now(), updated_by = auth.uid()
   where id;
  return to_jsonb(private.team_rules()) - 'id' - 'updated_by';
end $$;

-- ─────────────────────────────────────────────────────────── a member's own deadline (after an extension)
alter table public.staff_task_assignees add column if not exists due_at timestamptz;

-- ─────────────────────────────────────────────────────────── requests: more time, or excused
create table public.staff_task_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  kind text not null check (kind in ('extension', 'excuse')),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  new_due timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (kind <> 'extension' or new_due is not null)
);
create unique index staff_task_requests_pending_idx on public.staff_task_requests (task_id, staff_id) where status = 'pending';
create index staff_task_requests_staff_idx on public.staff_task_requests (staff_id);
create index staff_task_requests_decided_by_idx on public.staff_task_requests (decided_by);
alter table public.staff_task_requests enable row level security;
revoke all on public.staff_task_requests from anon, authenticated;

-- ─────────────────────────────────────────────────────────── appeals against a warning
alter table public.staff_warnings
  add column if not exists appeal text check (char_length(appeal) <= 600),
  add column if not exists appeal_at timestamptz,
  add column if not exists appeal_status text check (appeal_status in ('pending', 'accepted', 'rejected')),
  add column if not exists appeal_decided_by uuid references auth.users (id) on delete set null,
  add column if not exists appeal_decided_at timestamptz,
  add column if not exists appeal_note text check (char_length(appeal_note) <= 300);
create index if not exists staff_warnings_appeal_decided_by_idx on public.staff_warnings (appeal_decided_by);
