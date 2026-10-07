-- Event registration on the website: a form on the event page, a QR ticket, a waiting list when the
-- event is full, and a check-in scanner in the BuildX App.

alter table public.site_content
  add column rsvp_open boolean not null default false,
  add column capacity int check (capacity between 1 and 5000);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.site_content (id) on delete cascade,
  ticket text not null unique check (ticket ~ '^BXT-[0-9A-F]{8}$'),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  faculty text check (char_length(faculty) <= 120),
  status text not null default 'going' check (status in ('going', 'waitlist', 'cancelled')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, phone)
);
create index event_registrations_event_idx on public.event_registrations (event_id, status, created_at);
create index event_registrations_checked_in_by_idx on public.event_registrations (checked_in_by);

alter table public.event_registrations enable row level security;
create policy event_registrations_select on public.event_registrations for select to authenticated using ((select private.is_staff()));
create policy event_registrations_update on public.event_registrations for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
grant select, update on public.event_registrations to authenticated;

/** When someone with a place cancels, the first person on the waiting list gets it. */
create or replace function private.event_promote() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'going' and new.status = 'cancelled' then
    update public.event_registrations set status = 'going'
     where id = (select id from public.event_registrations where event_id = new.event_id and status = 'waitlist' order by created_at limit 1);
  end if;
  return null;
end $$;
create trigger event_registrations_promote after update of status on public.event_registrations
  for each row execute function private.event_promote();

create or replace function private.norm_phone(p text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v ~ '^01[0-9]{9}$' then return '+2' || v; end if;
  if v ~ '^00[0-9]+$' then return '+' || substr(v, 3); end if;
  return v;
end $$;

create or replace function private.norm_ticket(p text) returns text
language sql immutable set search_path = ''
as $$
  select case when t ~ '^BXT[0-9A-F]{8}$' then 'BXT-' || substr(t, 4) else t end
  from (select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) as t) x
$$;

/** Open places for an event page: {open, capacity, going}. */
create or replace function public.event_rsvp(p_event uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'open', c.rsvp_open and coalesce(c.ends_at, c.starts_at + interval '6 hours', now() + interval '1 day') > now(),
    'capacity', c.capacity,
    'going', (select count(*) from public.event_registrations r where r.event_id = c.id and r.status = 'going')
  )
  from public.site_content c
  where c.id = p_event and c.kind = 'event' and c.published and (c.publish_at is null or c.publish_at <= now())
$$;

/** Register for an event from the website. 10 registrations per address per hour. */
create or replace function public.register_event(p_event uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ev public.site_content%rowtype;
  v_phone text := private.norm_phone(p ->> 'phone');
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_reg public.event_registrations%rowtype;
  v_going int;
  v_status text;
  v_ticket text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('rsvp', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'rsvp'));
    return jsonb_build_object('ok', true, 'ticket', 'BXT-00000000', 'status', 'going');
  end if;

  select * into v_ev from public.site_content
   where id = p_event and kind = 'event' and published and rsvp_open and (publish_at is null or publish_at <= now())
   for update;
  if not found or coalesce(v_ev.ends_at, v_ev.starts_at + interval '6 hours', now() + interval '1 day') <= now() then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  select * into v_reg from public.event_registrations where event_id = p_event and phone = v_phone;
  if found then
    return jsonb_build_object('ok', true, 'ticket', v_reg.ticket, 'status', v_reg.status, 'duplicate', true);
  end if;

  select count(*) into v_going from public.event_registrations where event_id = p_event and status = 'going';
  v_status := case when v_ev.capacity is null or v_going < v_ev.capacity then 'going' else 'waitlist' end;
  loop
    v_ticket := 'BXT-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.event_registrations where ticket = v_ticket);
  end loop;

  begin
    insert into public.event_registrations (event_id, ticket, full_name, phone, email, faculty, status)
    values (p_event, v_ticket, btrim(p ->> 'full_name'), v_phone, v_email, nullif(btrim(coalesce(p ->> 'faculty', '')), ''), v_status);
  exception
    when check_violation or not_null_violation or string_data_right_truncation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true, 'ticket', v_ticket, 'status', v_status);
end $$;

/** A ticket page: who it's for, which event, and whether it's confirmed. 60 lookups per 10 minutes. */
create or replace function public.event_ticket(p_ticket text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if not private.throttle('ticket', 60, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select g.ticket, g.full_name, g.status, g.checked_in_at, c.id as event_id, c.slug, c.title, c.title_ar, c.starts_at, c.location, c.location_ar,
         (select count(*) from public.event_registrations w where w.event_id = g.event_id and w.status = 'waitlist' and w.created_at <= g.created_at) as place
    into r
    from public.event_registrations g join public.site_content c on c.id = g.event_id
   where g.ticket = private.norm_ticket(p_ticket);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'ticket', r.ticket, 'name', r.full_name, 'status', r.status, 'checked_in', r.checked_in_at is not null,
    'waitlist_place', case when r.status = 'waitlist' then r.place end,
    'event', jsonb_build_object('id', r.event_id, 'slug', r.slug, 'title', r.title, 'title_ar', r.title_ar, 'starts_at', r.starts_at, 'location', r.location, 'location_ar', r.location_ar));
end $$;

/** The registrant cancels with their ticket and phone number; their place goes to the waiting list. */
create or replace function public.cancel_event_registration(p_ticket text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.throttle('ticket', 60, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.event_registrations set status = 'cancelled'
   where ticket = private.norm_ticket(p_ticket) and phone = private.norm_phone(p_phone) and status <> 'cancelled' and checked_in_at is null;
  return jsonb_build_object('ok', found, 'error', case when found then null else 'not_found' end);
end $$;

/** Door check-in from the BuildX App scanner (or a typed ticket code). */
create or replace function public.staff_check_in(p_event uuid, p_ticket text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g public.event_registrations%rowtype;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into g from public.event_registrations where ticket = private.norm_ticket(substring(p_ticket from '(BXT-?[0-9A-Fa-f]{8})'));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if g.event_id <> p_event then
    return jsonb_build_object('ok', false, 'error', 'other_event', 'name', g.full_name,
      'event', (select coalesce(title_ar, title) from public.site_content where id = g.event_id));
  end if;
  if g.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'cancelled', 'name', g.full_name);
  end if;
  if g.checked_in_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'name', g.full_name, 'status', g.status, 'at', g.checked_in_at);
  end if;
  update public.event_registrations set checked_in_at = now(), checked_in_by = auth.uid() where id = g.id;
  return jsonb_build_object('ok', true, 'name', g.full_name, 'status', g.status, 'ticket', g.ticket);
end $$;

revoke execute on function private.event_promote(), private.norm_phone(text), private.norm_ticket(text) from public, anon, authenticated;
revoke execute on function public.event_rsvp(uuid), public.register_event(uuid, jsonb), public.event_ticket(text), public.cancel_event_registration(text, text), public.staff_check_in(uuid, text) from public;
grant execute on function public.event_rsvp(uuid), public.register_event(uuid, jsonb), public.event_ticket(text), public.cancel_event_registration(text, text) to anon, authenticated;
grant execute on function public.staff_check_in(uuid, text) to authenticated;

-- New public tables get default grants for anon; RLS already returns nothing, but take them away too.
revoke all on public.event_registrations, public.certificates from anon;
