-- Sectors and team tasks.
--   The team is split into sectors (media, robotics, organising…), each with one or more heads and
--   its members (team accounts). A head gives the members of their sector tasks with a deadline; the
--   members get a notification, start, and hand the task in (a note and/or a link); the head approves
--   it or sends it back. A day before the deadline the member gets a reminder; a task not handed in
--   by its deadline gives them a warning automatically (heads can also give one by hand). Three active
--   warnings in 90 days alert whoever oversees the team.
--   The owner (and an admin with every area, or anyone given the new "sectors" area) oversees every
--   sector: creates sectors, sets heads and members, sees every task and warning, and can cancel a
--   warning. Everything goes through the functions below; the tables are closed to direct access.

alter table public.staff drop constraint if exists staff_permissions_check;
alter table public.staff add constraint staff_permissions_check check (permissions <@ array[
  'applications', 'students', 'events', 'content', 'inbox', 'certificates', 'publish', 'settings', 'portfolios', 'notify', 'security',
  'roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points', 'site', 'forms', 'sectors']);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  color text not null default '#2f7bff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sectors_name_idx on public.sectors (lower(btrim(name))) where not archived;
create index sectors_created_by_idx on public.sectors (created_by);

create table public.sector_members (
  sector_id uuid not null references public.sectors (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  is_head boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (sector_id, staff_id)
);
create index sector_members_staff_idx on public.sector_members (staff_id);

create table public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  link text check (link is null or (link ~* '^https://[^[:space:]]+$' and char_length(link) <= 300)),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz not null,
  warn_on_miss boolean not null default true,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_tasks_sector_idx on public.staff_tasks (sector_id, due_at desc);
create index staff_tasks_open_due_idx on public.staff_tasks (due_at) where status = 'open';
create index staff_tasks_created_by_idx on public.staff_tasks (created_by);

create table public.staff_task_assignees (
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  state text not null default 'todo' check (state in ('todo', 'doing', 'submitted', 'approved', 'redo')),
  note text check (char_length(note) <= 2000),
  link text check (link is null or (link ~* '^https://[^[:space:]]+$' and char_length(link) <= 300)),
  submitted_at timestamptz,
  late boolean not null default false,
  feedback text check (char_length(feedback) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reminded_at timestamptz,
  missed_at timestamptz,
  primary key (task_id, staff_id)
);
create index staff_task_assignees_staff_idx on public.staff_task_assignees (staff_id);
create index staff_task_assignees_reviewed_by_idx on public.staff_task_assignees (reviewed_by);

create table public.staff_warnings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  task_id uuid references public.staff_tasks (id) on delete set null,
  kind text not null check (kind in ('missed', 'manual')),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  issued_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancel_note text check (char_length(cancel_note) <= 300)
);
create unique index staff_warnings_missed_idx on public.staff_warnings (task_id, staff_id) where kind = 'missed';
create index staff_warnings_staff_idx on public.staff_warnings (staff_id, created_at desc);
create index staff_warnings_sector_idx on public.staff_warnings (sector_id);
create index staff_warnings_task_idx on public.staff_warnings (task_id);
create index staff_warnings_issued_by_idx on public.staff_warnings (issued_by);
create index staff_warnings_cancelled_by_idx on public.staff_warnings (cancelled_by);

alter table public.sectors enable row level security;
alter table public.sector_members enable row level security;
alter table public.staff_tasks enable row level security;
alter table public.staff_task_assignees enable row level security;
alter table public.staff_warnings enable row level security;
revoke all on public.sectors, public.sector_members, public.staff_tasks, public.staff_task_assignees, public.staff_warnings from anon, authenticated;

create trigger sectors_touch before update on public.sectors for each row execute function private.touch();
create trigger staff_tasks_touch before update on public.staff_tasks for each row execute function private.touch();
create trigger sectors_audit after insert or update or delete on public.sectors for each row execute function private.audit();
create trigger staff_tasks_audit after insert or delete on public.staff_tasks for each row execute function private.audit();
create trigger staff_warnings_audit after insert or update on public.staff_warnings for each row execute function private.audit();

-- ─────────────────────────────────────────────────────────── notifications to chosen people
alter table public.push_messages add column if not exists to_staff uuid[];
-- Personal messages (a task, a warning) are seen only by the people they went to and the full admins.
alter policy push_messages_select on public.push_messages
  using ((select private.is_staff()) and (to_staff is null or (select auth.uid()) = any(to_staff) or (select private.is_admin())));
select private.patch_function('public.push_targets(uuid)',
  $p$when 'staff' then s.audience = 'staff' and (m.area is null$p$,
  $p$when 'staff' then s.audience = 'staff' and (m.to_staff is null or s.staff_id = any(m.to_staff)) and (m.area is null$p$);
select private.patch_function('public.push_native_targets(uuid)',
  $p$when 'staff' then d.app = 'staff' and x.active$p$,
  $p$when 'staff' then d.app = 'staff' and x.active and (m.to_staff is null or d.staff_id = any(m.to_staff))$p$);

/** A notification to these team members only (their browsers and phones). Never fails the caller. */
create or replace function private.notify_staff_users(p_ids uuid[], p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(p_ids) as x where x is not null);
  v_id uuid;
  v_token text;
begin
  if cardinality(v_ids) = 0 then
    return;
  end if;
  if not exists (select 1 from public.push_subscriptions where audience = 'staff' and disabled_at is null and staff_id = any(v_ids))
     and not exists (select 1 from public.native_push_tokens where app = 'staff' and disabled_at is null and staff_id = any(v_ids)) then
    return;
  end if;
  insert into public.push_messages (title, body, url, audience, to_staff)
  values (left(btrim(p_title), 80), left(coalesce(btrim(p_body), ''), 240), p_url, 'staff', v_ids)
  returning id into v_id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.push_tokens (message_id, token) values (v_id, v_token);
  perform net.http_post(
    url := 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/push-deliver',
    body := jsonb_build_object('id', v_id, 'token', v_token),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  null;
end $$;
revoke execute on function private.notify_staff_users(uuid[], text, text, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────── who may do what
/** Oversees every sector: the owner, a full admin, or anyone given the "sectors" area. */
create or replace function private.oversees() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.can('sectors') $$;

/** Runs this sector: oversees everything, or is one of its heads. */
create or replace function private.leads_sector(p_sector uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.oversees() or (private.is_staff() and exists (
    select 1 from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
     where m.sector_id = p_sector and m.staff_id = auth.uid() and m.is_head))
$$;

/** A sector's heads (active accounts). */
create or replace function private.sector_heads(p_sector uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.staff_id), '{}') from public.sector_members m join public.staff s on s.user_id = m.staff_id and s.active
   where m.sector_id = p_sector and m.is_head
$$;

create or replace function private.overseer_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(user_id), '{}') from public.staff where active and private.member_can(role, permissions, 'sectors')
$$;

create or replace function private.staff_name(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) from public.staff where user_id = p_id $$;

revoke execute on function private.oversees(), private.leads_sector(uuid), private.sector_heads(uuid), private.overseer_ids(), private.staff_name(uuid) from public, anon;
grant execute on function private.oversees(), private.leads_sector(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────── warnings: tell the member (and, at three, the overseers)
create or replace function private.on_staff_warning() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_active int;
begin
  perform private.notify_staff_users(array[new.staff_id], '⚠️ إنذار', new.reason, '/app/#/staff/mytasks');
  select count(*) into v_active from public.staff_warnings
   where staff_id = new.staff_id and cancelled_at is null and created_at > now() - interval '90 days';
  if v_active >= 3 then
    perform private.notify_staff_users(array_remove(private.overseer_ids() || private.sector_heads(new.sector_id), new.staff_id),
      private.staff_name(new.staff_id) || ' وصل ' || v_active || ' إنذارات',
      'في آخر 90 يوم. آخرها: ' || new.reason, '/app/#/staff/warnings');
  end if;
  return null;
end $$;
create trigger staff_warnings_notify after insert on public.staff_warnings for each row execute function private.on_staff_warning();
revoke execute on function private.on_staff_warning() from public, anon, authenticated;
