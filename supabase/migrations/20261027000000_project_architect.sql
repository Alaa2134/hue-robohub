-- Project Architect: what a Lab design costs and where to get it, from real, dated sources only.
--  * Availability: the BuildX store itself (inventory items linked to a Lab part type), minus what's
--    out on loan right now.
--  * Prices: entered by the team, each with the shop it came from, a link and the day it was checked.
--    A price older than 30 days is marked as such; a part with no price says so — nothing is guessed.
-- The optional AI plan (architect-plan Edge Function) only picks parts from the Lab's catalog; it is
-- off until the team turns it on (site_settings 'architect_ai') and shares the guide's limits.

alter table public.inventory_items add column if not exists lab_part text check (lab_part is null or lab_part ~ '^[a-z0-9-]{2,40}$');
create index if not exists inventory_items_lab_part on public.inventory_items (lab_part) where lab_part is not null;

create table if not exists public.part_prices (
  id uuid primary key default gen_random_uuid(),
  lab_part text not null check (lab_part ~ '^[a-z0-9-]{2,40}$'),
  label text not null default '' check (char_length(label) <= 120),
  price numeric not null check (price > 0 and price < 1000000),
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  source_name text not null check (char_length(btrim(source_name)) between 2 and 80),
  source_url text check (source_url is null or (source_url ~* '^https://[^[:space:]]+$' and char_length(source_url) <= 400)),
  checked_on date not null check (checked_on <= (now() at time zone 'Africa/Cairo')::date),
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists part_prices_part on public.part_prices (lab_part) where not archived;
create index if not exists part_prices_created_by on public.part_prices (created_by);
alter table public.part_prices enable row level security;
revoke all on public.part_prices from anon, authenticated;
create trigger part_prices_audit after insert or update on public.part_prices for each row execute function private.audit();

/** For each Lab part type: in the BuildX store (free now) and every current price with its source and date. */
create or replace function public.architect_parts(p_parts text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_parts is null or cardinality(p_parts) > 80 then return '{}'; end if;
  return coalesce((
    select jsonb_object_agg(t.part, jsonb_build_object(
      'store', (select jsonb_build_object(
                  'items', count(*),
                  'free', coalesce(sum(greatest(0, i.quantity - coalesce((select sum(l.quantity) from public.inventory_loans l where l.item_id = i.id and l.returned_at is null), 0))), 0),
                  'students', coalesce(bool_or(i.students_can_borrow), false))
                 from public.inventory_items i where i.lab_part = t.part and not i.archived),
      'prices', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'price', p.price, 'currency', p.currency, 'source', p.source_name,
                                                              'url', p.source_url, 'checked_on', p.checked_on,
                                                              'stale', p.checked_on < (now() at time zone 'Africa/Cairo')::date - 30)
                                           order by p.price)
                            from public.part_prices p where p.lab_part = t.part and not p.archived), '[]')))
      from (select distinct unnest(p_parts) as part) t
     where t.part ~ '^[a-z0-9-]{2,40}$'), '{}');
end $$;

create or replace function public.architect_ai_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'architect_ai'), false)
$$;

/** For the architect-plan Edge Function (service role): the AI switch, then the guide's limits. */
create or replace function public.architect_ai_allow(p_ip text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.architect_ai_on() then return false; end if;
  return public.guide_chat_allow(p_ip);
end $$;

/* ─── Team ─────────────────────────────────────────────────────────────── */

create or replace function public.staff_part_prices()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ai', public.architect_ai_on(),
    'prices', coalesce((select jsonb_agg(to_jsonb(p) - 'created_by' order by p.lab_part, p.price) from public.part_prices p where not p.archived), '[]'),
    'linked', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'lab_part', i.lab_part, 'quantity', i.quantity) order by i.name)
                          from public.inventory_items i where not i.archived), '[]'));
end $$;

create or replace function public.staff_part_price_save(p_id uuid, p_part text, p_label text, p_price numeric, p_source text, p_url text, p_checked date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.part_prices (lab_part, label, price, source_name, source_url, checked_on)
    values (p_part, left(coalesce(p_label, ''), 120), p_price, btrim(p_source), nullif(btrim(coalesce(p_url, '')), ''), p_checked);
  else
    update public.part_prices set lab_part = p_part, label = left(coalesce(p_label, ''), 120), price = p_price, source_name = btrim(p_source),
                                  source_url = nullif(btrim(coalesce(p_url, '')), ''), checked_on = p_checked
     where id = p_id and not archived;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create or replace function public.staff_part_price_archive(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.part_prices set archived = true where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

/** Link a store item to the Lab part it is (so designs see it as available). */
create or replace function public.staff_inventory_link(p_item uuid, p_part text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.inventory_items set lab_part = nullif(btrim(coalesce(p_part, '')), '') where id = p_item;
  return jsonb_build_object('ok', found);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create or replace function public.staff_architect_ai(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('settings') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.site_settings (key, value) values ('architect_ai', jsonb_build_object('enabled', p_enabled))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.architect_parts(text[]), public.architect_ai_on(), public.architect_ai_allow(text), public.staff_part_prices(),
  public.staff_part_price_save(uuid, text, text, numeric, text, text, date), public.staff_part_price_archive(uuid), public.staff_inventory_link(uuid, text),
  public.staff_architect_ai(boolean) from public;
grant execute on function public.architect_parts(text[]), public.architect_ai_on() to anon, authenticated;
grant execute on function public.architect_ai_allow(text) to service_role;
grant execute on function public.staff_part_prices(), public.staff_part_price_save(uuid, text, text, numeric, text, text, date), public.staff_part_price_archive(uuid),
  public.staff_inventory_link(uuid, text), public.staff_architect_ai(boolean) to authenticated;
