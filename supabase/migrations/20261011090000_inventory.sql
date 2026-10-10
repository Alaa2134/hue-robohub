-- The team's store: parts and tools (Arduinos, sensors, motors, soldering irons…), how many there are,
-- where they're kept, and who has what. The store keepers (the new "inventory" area, and overseers)
-- lend items to a team member or a student with a return date, take them back, and mark consumables
-- (resistors, wires…) as used. Team members ask to borrow from the app. Reminders go out a day before
-- the return date and when it passes; the keepers hear when something runs low.

alter table public.staff drop constraint if exists staff_permissions_check;
alter table public.staff add constraint staff_permissions_check check (permissions <@ array[
  'applications', 'students', 'events', 'content', 'inbox', 'certificates', 'publish', 'settings', 'portfolios', 'notify', 'security',
  'roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points', 'site', 'forms', 'sectors', 'inventory']);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null default '' check (char_length(category) <= 40),
  description text not null default '' check (char_length(description) <= 1000),
  location text not null default '' check (char_length(location) <= 80),
  quantity int not null default 0 check (quantity between 0 and 100000),
  min_quantity int not null default 0 check (min_quantity between 0 and 100000),
  unit text not null default 'قطعة' check (char_length(unit) between 1 and 20),
  consumable boolean not null default false,
  archived boolean not null default false,
  low_notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_name_idx on public.inventory_items (lower(name));
create index inventory_items_created_by_idx on public.inventory_items (created_by);
create trigger inventory_items_touch before update on public.inventory_items for each row execute function private.touch();
create trigger inventory_items_audit after insert or update on public.inventory_items for each row execute function private.audit();

create table public.inventory_loans (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity int not null check (quantity between 1 and 10000),
  staff_id uuid references public.staff (user_id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  borrower_name text not null check (char_length(btrim(borrower_name)) between 2 and 120),
  purpose text not null default '' check (char_length(purpose) <= 300),
  due_at timestamptz,
  status text not null default 'out' check (status in ('out', 'returned', 'lost', 'consumed')),
  lent_by uuid references auth.users (id) on delete set null default auth.uid(),
  lent_at timestamptz not null default now(),
  returned_at timestamptz,
  returned_to uuid references auth.users (id) on delete set null,
  return_note text check (char_length(return_note) <= 300),
  reminded_at timestamptz,
  overdue_at timestamptz
);
create index inventory_loans_item_idx on public.inventory_loans (item_id);
create index inventory_loans_out_idx on public.inventory_loans (due_at) where status = 'out';
create index inventory_loans_staff_idx on public.inventory_loans (staff_id);
create index inventory_loans_student_idx on public.inventory_loans (student_id);
create index inventory_loans_lent_by_idx on public.inventory_loans (lent_by);
create index inventory_loans_returned_to_idx on public.inventory_loans (returned_to);

create table public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  quantity int not null check (quantity between 1 and 10000),
  purpose text not null check (char_length(btrim(purpose)) between 2 and 300),
  needed_until timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  note text check (char_length(note) <= 300),
  loan_id uuid references public.inventory_loans (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_requests_item_idx on public.inventory_requests (item_id);
create index inventory_requests_staff_idx on public.inventory_requests (staff_id);
create index inventory_requests_pending_idx on public.inventory_requests (created_at) where status = 'pending';
create index inventory_requests_decided_by_idx on public.inventory_requests (decided_by);
create index inventory_requests_loan_idx on public.inventory_requests (loan_id);

alter table public.inventory_items enable row level security;
alter table public.inventory_loans enable row level security;
alter table public.inventory_requests enable row level security;
revoke all on public.inventory_items, public.inventory_loans, public.inventory_requests from anon, authenticated;

-- ─────────────────────────────────────────────────────────── notifications to chosen students
alter table public.push_messages add column if not exists to_students uuid[];
select private.patch_function('public.push_targets(uuid)',
  $p$when 'students' then s.audience = 'student' and st.active$p$,
  $p$when 'students' then s.audience = 'student' and st.active and (m.to_students is null or s.student_id = any(m.to_students))$p$);
select private.patch_function('public.push_native_targets(uuid)',
  $p$when 'students' then d.app = 'student' and st.active$p$,
  $p$when 'students' then d.app = 'student' and st.active and (m.to_students is null or d.student_id = any(m.to_students))$p$);

/** A notification to these students only (their browsers and phones). Never fails the caller. */
create or replace function private.notify_student_ids(p_ids uuid[], p_title text, p_body text, p_url text) returns void
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
  if not exists (select 1 from public.push_subscriptions where audience = 'student' and disabled_at is null and student_id = any(v_ids))
     and not exists (select 1 from public.native_push_tokens where app = 'student' and disabled_at is null and student_id = any(v_ids)) then
    return;
  end if;
  insert into public.push_messages (title, body, url, audience, to_students)
  values (left(btrim(p_title), 80), left(coalesce(btrim(p_body), ''), 240), p_url, 'students', v_ids)
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
revoke execute on function private.notify_student_ids(uuid[], text, text, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────── helpers
/** How many of an item are on the shelf now (consumables: the stock; others: stock minus what's lent out). */
create or replace function private.inventory_available(p_item uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select i.quantity - case when i.consumable then 0 else coalesce((select sum(l.quantity) from public.inventory_loans l where l.item_id = i.id and l.status = 'out'), 0) end
    from public.inventory_items i where i.id = p_item
$$;

/** Tell the keepers once when an item runs low (again only after it was restocked above the line). */
create or replace function private.inventory_low_check(p_item uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  i public.inventory_items;
  v_left int := private.inventory_available(p_item);
begin
  select * into i from public.inventory_items where id = p_item;
  if i.id is null or i.min_quantity = 0 then
    return;
  end if;
  if v_left <= i.min_quantity and i.low_notified_at is null then
    update public.inventory_items set low_notified_at = now() where id = p_item;
    perform private.notify_staff('inventory', '📦 قرّب يخلص: ' || i.name, 'فاضل ' || v_left || ' ' || i.unit || ' بس.', '/app/#/staff/inventory');
  elsif v_left > i.min_quantity and i.low_notified_at is not null then
    update public.inventory_items set low_notified_at = null where id = p_item;
  end if;
end $$;
revoke execute on function private.inventory_available(uuid), private.inventory_low_check(uuid) from public, anon, authenticated;
