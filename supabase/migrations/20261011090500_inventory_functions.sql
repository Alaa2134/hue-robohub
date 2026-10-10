-- The store, part 2: what the keepers and the team do (tables in 20261011090000_inventory.sql).

/** Keeps the store: the "inventory" area (owners and full admins have it). */
create or replace function private.keeps_store() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.can('inventory') $$;
revoke execute on function private.keeps_store() from public, anon, authenticated;

create or replace function private.loan_json(l public.inventory_loans) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(l) || jsonb_build_object(
    'item_name', (select name from public.inventory_items where id = l.item_id),
    'unit', (select unit from public.inventory_items where id = l.item_id),
    'lent_by_name', private.staff_name(l.lent_by),
    'student_code', (select code from public.students where id = l.student_id))
$$;
revoke execute on function private.loan_json(public.inventory_loans) from public, anon, authenticated;

/** The store for this team member: every item with what's on the shelf; the keepers also get every
    loan out and the pending requests; everyone else their own loans and requests. */
create or replace function public.staff_inventory() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_keep boolean := private.keeps_store();
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'keeps', v_keep,
    'items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
               'available', private.inventory_available(i.id),
               'out', (select coalesce(sum(l.quantity), 0) from public.inventory_loans l where l.item_id = i.id and l.status = 'out'))
             order by i.category, i.name)
               from public.inventory_items i where not i.archived or v_keep), '[]'::jsonb),
    'loans', coalesce((select jsonb_agg(private.loan_json(l) order by l.due_at nulls last, l.lent_at desc)
               from public.inventory_loans l
              where (v_keep and (l.status = 'out' or l.lent_at > now() - interval '30 days'))
                 or (l.staff_id = auth.uid() and (l.status = 'out' or l.lent_at > now() - interval '60 days'))), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('name', private.staff_name(r.staff_id),
                   'item_name', (select name from public.inventory_items where id = r.item_id), 'available', private.inventory_available(r.item_id))
                 order by r.created_at desc)
               from public.inventory_requests r
              where (v_keep and r.status = 'pending') or (r.staff_id = auth.uid() and r.created_at > now() - interval '30 days')), '[]'::jsonb));
end $$;

/** Keepers: add or edit an item (the stock count included). */
create or replace function public.staff_inventory_item_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.inventory_items (name, category, description, location, quantity, min_quantity, unit, consumable)
    values (btrim(p ->> 'name'), coalesce(btrim(p ->> 'category'), ''), coalesce(btrim(p ->> 'description'), ''), coalesce(btrim(p ->> 'location'), ''),
            coalesce((p ->> 'quantity')::int, 0), coalesce((p ->> 'min_quantity')::int, 0), coalesce(nullif(btrim(p ->> 'unit'), ''), 'قطعة'),
            coalesce((p ->> 'consumable')::boolean, false))
    returning id into v_id;
  else
    update public.inventory_items set
      name = btrim(p ->> 'name'), category = coalesce(btrim(p ->> 'category'), ''), description = coalesce(btrim(p ->> 'description'), ''),
      location = coalesce(btrim(p ->> 'location'), ''), quantity = coalesce((p ->> 'quantity')::int, quantity),
      min_quantity = coalesce((p ->> 'min_quantity')::int, min_quantity), unit = coalesce(nullif(btrim(p ->> 'unit'), ''), unit),
      consumable = coalesce((p ->> 'consumable')::boolean, consumable), archived = coalesce((p ->> 'archived')::boolean, archived)
     where id = p_id returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.inventory_low_check(v_id);
  return v_id;
end $$;

/** Keepers: lend (or hand out a consumable) to a team member, a student, or someone by name. */
create or replace function public.staff_inventory_lend(p_item uuid, p_qty int, p_staff uuid, p_student uuid, p_name text, p_purpose text, p_due timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  i public.inventory_items;
  v_id uuid;
  v_name text;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into i from public.inventory_items where id = p_item and not archived;
  if i.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if coalesce(p_qty, 0) < 1 or p_qty > private.inventory_available(p_item) then
    raise exception 'not_enough' using errcode = '22023';
  end if;
  if not i.consumable and (p_due is null or p_due < now()) then
    raise exception 'bad_due' using errcode = '22023';
  end if;
  v_name := coalesce(case when p_staff is not null then private.staff_name(p_staff) end,
                     (select full_name from public.students where id = p_student), nullif(btrim(p_name), ''));
  if v_name is null then
    raise exception 'no_borrower' using errcode = '22023';
  end if;
  insert into public.inventory_loans (item_id, quantity, staff_id, student_id, borrower_name, purpose, due_at, status)
  values (p_item, p_qty, p_staff, case when p_staff is null then p_student end, v_name, coalesce(btrim(p_purpose), ''),
          case when i.consumable then null else p_due end, case when i.consumable then 'consumed' else 'out' end)
  returning id into v_id;
  if i.consumable then
    update public.inventory_items set quantity = quantity - p_qty where id = p_item;
  end if;
  if p_staff is not null and p_staff <> auth.uid() then
    perform private.notify_staff_users(array[p_staff], '📦 استلمت: ' || i.name || ' × ' || p_qty,
      case when i.consumable then 'من المخزن.' else 'رجّعها قبل ' || to_char(p_due at time zone 'Africa/Cairo', 'DD/MM') || '.' end, '/app/#/staff/inventory');
  end if;
  perform private.inventory_low_check(p_item);
  return v_id;
end $$;

/** Keepers: it came back (or was lost: the stock goes down). */
create or replace function public.staff_inventory_return(p_loan uuid, p_status text, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  l public.inventory_loans;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('returned', 'lost') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  update public.inventory_loans set status = p_status, returned_at = now(), returned_to = auth.uid(), return_note = nullif(left(btrim(p_note), 300), '')
   where id = p_loan and status = 'out' returning * into l;
  if l.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_status = 'lost' then
    update public.inventory_items set quantity = greatest(0, quantity - l.quantity) where id = l.item_id;
  end if;
  if l.staff_id is not null and l.staff_id <> auth.uid() then
    perform private.notify_staff_users(array[l.staff_id],
      case when p_status = 'returned' then '✅ اتسجّل إنك رجّعت: ' else 'اتسجّل مفقود: ' end || (select name from public.inventory_items where id = l.item_id),
      coalesce(nullif(btrim(p_note), ''), case when p_status = 'returned' then 'شكرًا 🙏' else 'كلّم أمين المخزن.' end), '/app/#/staff/inventory');
  end if;
  perform private.inventory_low_check(l.item_id);
  return jsonb_build_object('ok', true);
end $$;

/** Any team member: ask to borrow. The keepers are told. */
create or replace function public.staff_inventory_request(p_item uuid, p_qty int, p_purpose text, p_until timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  i public.inventory_items;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into i from public.inventory_items where id = p_item and not archived;
  if i.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.inventory_requests where item_id = p_item and staff_id = auth.uid() and status = 'pending') then
    raise exception 'pending' using errcode = '22023';
  end if;
  insert into public.inventory_requests (item_id, staff_id, quantity, purpose, needed_until)
  values (p_item, auth.uid(), greatest(1, coalesce(p_qty, 1)), btrim(p_purpose), p_until)
  returning id into v_id;
  perform private.notify_staff('inventory', '📦 طلب استعارة: ' || i.name || ' × ' || greatest(1, coalesce(p_qty, 1)),
    private.staff_name(auth.uid()) || ' · ' || left(btrim(p_purpose), 120), '/app/#/staff/inventory');
  return v_id;
end $$;

/** Keepers: approve a request (it becomes a loan until the date given) or refuse it. */
create or replace function public.staff_inventory_request_decide(p_id uuid, p_approve boolean, p_note text, p_due timestamptz default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.inventory_requests;
  v_loan uuid;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.inventory_requests where id = p_id and status = 'pending';
  if r.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if p_approve then
    v_loan := public.staff_inventory_lend(r.item_id, r.quantity, r.staff_id, null, null, r.purpose, coalesce(p_due, r.needed_until, now() + interval '7 days'));
  else
    perform private.notify_staff_users(array[r.staff_id], '❌ طلب الاستعارة اترفض: ' || (select name from public.inventory_items where id = r.item_id),
      coalesce(nullif(btrim(p_note), ''), 'كلّم أمين المخزن.'), '/app/#/staff/inventory');
  end if;
  update public.inventory_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         note = nullif(left(btrim(p_note), 300), ''), loan_id = v_loan
   where id = p_id;
  return jsonb_build_object('ok', true, 'loan_id', v_loan);
end $$;

/** A student's own loans (the student app). */
create or replace function public.student_inventory(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'item', i.name, 'unit', i.unit, 'quantity', l.quantity, 'dueAt', l.due_at,
                     'status', l.status, 'lentAt', l.lent_at, 'returnedAt', l.returned_at) order by l.status = 'out' desc, l.due_at)
                     from public.inventory_loans l join public.inventory_items i on i.id = l.item_id
                    where l.student_id = v_id and (l.status = 'out' or l.lent_at > now() - interval '60 days')), '[]'::jsonb);
end $$;

/** Every 10 minutes (with the task sweep): a day before the return date, and when it passes (then every 3 days). */
create or replace function private.inventory_sweep() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    update public.inventory_loans l set reminded_at = now()
      from public.inventory_items i
     where i.id = l.item_id and l.status = 'out' and l.reminded_at is null and l.due_at between now() and now() + interval '1 day'
    returning l.staff_id, l.student_id, i.name, l.due_at
  loop
    perform private.notify_staff_users(array[r.staff_id], '📦 رجّع ' || r.name || ' بكرة', 'آخر ميعاد ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || '.', '/app/#/staff/inventory');
    perform private.notify_student_ids(array[r.student_id], '📦 رجّع ' || r.name || ' بكرة', 'آخر ميعاد ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM') || ' للمخزن.', '/app/#/me');
  end loop;
  for r in
    update public.inventory_loans l set overdue_at = now()
      from public.inventory_items i
     where i.id = l.item_id and l.status = 'out' and l.due_at < now() and (l.overdue_at is null or l.overdue_at < now() - interval '3 days')
    returning l.staff_id, l.student_id, l.borrower_name, i.name, l.due_at
  loop
    perform private.notify_staff_users(array[r.staff_id], '⚠️ اتأخرت في ترجيع ' || r.name, 'كان المفروض ترجع ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM') || '. رجّعها للمخزن.', '/app/#/staff/inventory');
    perform private.notify_student_ids(array[r.student_id], '⚠️ اتأخرت في ترجيع ' || r.name, 'رجّعها للمخزن في أقرب سيشن.', '/app/#/me');
    perform private.notify_staff('inventory', '📦 ' || r.borrower_name || ' اتأخر في ترجيع ' || r.name, 'من ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM') || '.', '/app/#/staff/inventory');
  end loop;
end $$;
revoke execute on function private.inventory_sweep() from public, anon, authenticated;
select private.patch_function('private.staff_task_sweep()',
  $p$  perform private.meeting_reminders();
$p$,
  $p$  perform private.meeting_reminders();
  perform private.inventory_sweep();
$p$);

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_inventory()', 'public.staff_inventory_item_save(uuid, jsonb)',
    'public.staff_inventory_lend(uuid, int, uuid, uuid, text, text, timestamptz)', 'public.staff_inventory_return(uuid, text, text)',
    'public.staff_inventory_request(uuid, int, text, timestamptz)', 'public.staff_inventory_request_decide(uuid, boolean, text, timestamptz)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.student_inventory(text) from public;
grant execute on function public.student_inventory(text) to anon, authenticated;
