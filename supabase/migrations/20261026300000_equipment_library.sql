-- Equipment Library, on top of the store: every item gets a QR code (BXE-XXXXXX) to scan when
-- lending or returning, a custodian on the team who answers for it, its condition and a photo; items
-- marked for students can be requested from the student app, and the custodian hears about overdue
-- returns too.

create or replace function private.equipment_code() returns text
language sql volatile set search_path = '' as $$
  select 'BXE-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
$$;

alter table public.inventory_items
  add column if not exists code text,
  add column if not exists custodian_id uuid references auth.users(id) on delete set null,
  add column if not exists condition text not null default 'good',
  add column if not exists photo_path text,
  add column if not exists students_can_borrow boolean not null default false;
update public.inventory_items set code = private.equipment_code() where code is null;
alter table public.inventory_items alter column code set default private.equipment_code(), alter column code set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_code_key') then
    alter table public.inventory_items add constraint inventory_items_code_key unique (code);
    alter table public.inventory_items add constraint inventory_items_code_check check (code ~ '^BXE-[0-9A-F]{6}$');
    alter table public.inventory_items add constraint inventory_items_condition_check check (condition in ('good', 'worn', 'repair', 'broken'));
    alter table public.inventory_items add constraint inventory_items_photo_check check (photo_path is null or char_length(photo_path) <= 300);
  end if;
end $$;

-- A request comes from a team member or from a student.
alter table public.inventory_requests alter column staff_id drop not null;
alter table public.inventory_requests add column if not exists student_id uuid references public.students(id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_requests_who_check') then
    alter table public.inventory_requests add constraint inventory_requests_who_check check ((staff_id is null) <> (student_id is null));
  end if;
end $$;

/** Items: the store's fields plus the library's (custodian, condition, photo, open to students). */
create or replace function public.staff_inventory_item_save(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_cust uuid := nullif(p ->> 'custodian_id', '')::uuid;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_cust is not null and not exists (select 1 from public.staff s where s.user_id = v_cust and s.active) then
    raise exception 'bad_custodian' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.inventory_items (name, category, description, location, quantity, min_quantity, unit, consumable, custodian_id, condition, photo_path, students_can_borrow)
    values (btrim(p ->> 'name'), coalesce(btrim(p ->> 'category'), ''), coalesce(btrim(p ->> 'description'), ''), coalesce(btrim(p ->> 'location'), ''),
            coalesce((p ->> 'quantity')::int, 0), coalesce((p ->> 'min_quantity')::int, 0), coalesce(nullif(btrim(p ->> 'unit'), ''), 'قطعة'),
            coalesce((p ->> 'consumable')::boolean, false), v_cust, coalesce(nullif(p ->> 'condition', ''), 'good'), nullif(p ->> 'photo_path', ''),
            coalesce((p ->> 'students_can_borrow')::boolean, false))
    returning id into v_id;
  else
    update public.inventory_items set
      name = btrim(p ->> 'name'), category = coalesce(btrim(p ->> 'category'), ''), description = coalesce(btrim(p ->> 'description'), ''),
      location = coalesce(btrim(p ->> 'location'), ''), quantity = coalesce((p ->> 'quantity')::int, quantity),
      min_quantity = coalesce((p ->> 'min_quantity')::int, min_quantity), unit = coalesce(nullif(btrim(p ->> 'unit'), ''), unit),
      consumable = coalesce((p ->> 'consumable')::boolean, consumable), archived = coalesce((p ->> 'archived')::boolean, archived),
      custodian_id = case when p ? 'custodian_id' then v_cust else custodian_id end,
      condition = coalesce(nullif(p ->> 'condition', ''), condition),
      photo_path = case when p ? 'photo_path' then nullif(p ->> 'photo_path', '') else photo_path end,
      students_can_borrow = coalesce((p ->> 'students_can_borrow')::boolean, students_can_borrow)
     where id = p_id returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.inventory_low_check(v_id);
  return v_id;
end $$;

/** A scanned QR label: the item, who looks after it, and who has it now. */
create or replace function public.staff_equipment_lookup(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  i public.inventory_items;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into i from public.inventory_items where code = upper(btrim(regexp_replace(coalesce(p_code, ''), '^.*(BXE-[0-9A-Fa-f]{6}).*$', '\1')));
  if i.id is null then return null; end if;
  return to_jsonb(i) || jsonb_build_object(
    'available', private.inventory_available(i.id),
    'custodian_name', private.staff_name(i.custodian_id),
    'loans', coalesce((select jsonb_agg(private.loan_json(l) order by l.due_at nulls last) from public.inventory_loans l
                        where l.item_id = i.id and l.status = 'out' and (private.keeps_store() or l.staff_id = auth.uid())), '[]'));
end $$;

/** What students may borrow, with what's free now, and this student's open requests and loans. */
create or replace function public.student_equipment(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category, 'description', i.description,
                         'unit', i.unit, 'photo', i.photo_path, 'available', private.inventory_available(i.id), 'condition', i.condition) order by i.category, i.name)
                         from public.inventory_items i where i.students_can_borrow and not i.archived and not i.consumable and i.condition <> 'broken'), '[]'),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'item', (select name from public.inventory_items where id = r.item_id), 'quantity', r.quantity,
                            'status', r.status, 'note', r.note, 'until', r.needed_until, 'at', r.created_at) order by r.created_at desc)
                            from public.inventory_requests r where r.student_id = v_id and r.created_at > now() - interval '60 days'), '[]'));
end $$;

/** A student asks to borrow something (one open request per item, five at most). */
create or replace function public.student_equipment_request(p_token text, p_item uuid, p_qty int, p_purpose text, p_until timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  i public.inventory_items;
  v_req uuid;
  v_name text;
begin
  select * into i from public.inventory_items where id = p_item and students_can_borrow and not archived and not consumable and condition <> 'broken';
  if i.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if char_length(btrim(coalesce(p_purpose, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'purpose'); end if;
  if p_until is null or p_until < now() or p_until > now() + interval '60 days' then return jsonb_build_object('ok', false, 'error', 'until'); end if;
  if coalesce(p_qty, 0) < 1 or p_qty > greatest(1, private.inventory_available(i.id)) then return jsonb_build_object('ok', false, 'error', 'quantity'); end if;
  if exists (select 1 from public.inventory_requests where item_id = i.id and student_id = v_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'pending');
  end if;
  if (select count(*) from public.inventory_requests where student_id = v_id and status = 'pending') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.inventory_requests (item_id, student_id, quantity, purpose, needed_until)
  values (i.id, v_id, p_qty, left(btrim(p_purpose), 300), p_until)
  returning id into v_req;
  select full_name into v_name from public.students where id = v_id;
  perform private.notify_staff('inventory', '📦 طالب عايز يستلف: ' || i.name || ' × ' || p_qty, coalesce(v_name, '') || ' · ' || left(btrim(p_purpose), 120), '/app/#/staff/inventory');
  if i.custodian_id is not null then
    perform private.notify_staff_users(array[i.custodian_id], '📦 طلب على ' || i.name, coalesce(v_name, '') || ' · ' || left(btrim(p_purpose), 120), '/app/#/staff/inventory');
  end if;
  return jsonb_build_object('ok', true, 'id', v_req);
end $$;

/** Approve (lends it to whoever asked: team member or student) or turn down a request. */
create or replace function public.staff_inventory_request_decide(p_id uuid, p_approve boolean, p_note text, p_due timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.inventory_requests;
  v_loan uuid;
  v_item text;
begin
  if not private.keeps_store() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.inventory_requests where id = p_id and status = 'pending';
  if r.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select name into v_item from public.inventory_items where id = r.item_id;
  if p_approve then
    v_loan := public.staff_inventory_lend(r.item_id, r.quantity, r.staff_id, r.student_id, null, r.purpose, coalesce(p_due, r.needed_until, now() + interval '7 days'));
    if r.student_id is not null then
      perform private.notify_student_ids(array[r.student_id], '✅ طلبك اتوافق عليه: ' || v_item,
        'استلمه من المخزن، ورجّعه قبل ' || to_char(coalesce(p_due, r.needed_until, now() + interval '7 days') at time zone 'Africa/Cairo', 'DD/MM') || '.', '/app/#/me');
    end if;
  else
    if r.staff_id is not null then
      perform private.notify_staff_users(array[r.staff_id], '❌ طلب الاستعارة اترفض: ' || v_item, coalesce(nullif(btrim(p_note), ''), 'كلّم أمين المخزن.'), '/app/#/staff/inventory');
    else
      perform private.notify_student_ids(array[r.student_id], '❌ طلب الاستعارة اترفض: ' || v_item, coalesce(nullif(btrim(p_note), ''), 'كلّم أمين المخزن.'), '/app/#/me');
    end if;
  end if;
  update public.inventory_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         note = nullif(left(btrim(p_note), 300), ''), loan_id = v_loan
   where id = p_id;
  return jsonb_build_object('ok', true, 'loan_id', v_loan);
end $$;

-- The store's list names students who asked, and the custodian hears about overdue returns.
select private.patch_function('public.staff_inventory()',
  $p$'name', private.staff_name(r.staff_id),$p$,
  $p$'name', coalesce(private.staff_name(r.staff_id), (select st.full_name from public.students st where st.id = r.student_id)), 'student', r.student_id is not null,$p$);
select private.patch_function('private.inventory_sweep()',
  $p$returning l.staff_id, l.student_id, l.borrower_name, i.name, l.due_at$p$,
  $p$returning l.staff_id, l.student_id, l.borrower_name, i.name, l.due_at, i.custodian_id$p$);
select private.patch_function('private.inventory_sweep()',
  $p$    perform private.notify_staff('inventory', '📦 ' || r.borrower_name || ' اتأخر في ترجيع ' || r.name,$p$,
  $p$    if r.custodian_id is not null then
      perform private.notify_staff_users(array[r.custodian_id], '📦 ' || r.borrower_name || ' اتأخر في ترجيع ' || r.name, 'إنت المسؤول عنها. من ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM') || '.', '/app/#/staff/inventory');
    end if;
    perform private.notify_staff('inventory', '📦 ' || r.borrower_name || ' اتأخر في ترجيع ' || r.name,$p$);

revoke all on function public.staff_equipment_lookup(text), public.student_equipment(text), public.student_equipment_request(text, uuid, int, text, timestamptz) from public;
grant execute on function public.staff_equipment_lookup(text) to authenticated;
grant execute on function public.student_equipment(text), public.student_equipment_request(text, uuid, int, text, timestamptz) to anon, authenticated;
