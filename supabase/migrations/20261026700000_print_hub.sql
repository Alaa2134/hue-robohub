-- Print Hub: students send a 3D file (STL, 3MF or OBJ) to be printed at BuildX. The app shows a rough
-- estimate from the model's volume, marked as such; the price is set only after the team slices the
-- file in a real slicer (Cura, OrcaSlicer, PrusaSlicer, Bambu Studio) and enters what it reported —
-- filament grams and print time. The price is then computed from the rates the team set and frozen,
-- and the student accepts it before anything is printed. No rates are set here: until the team sets
-- them there is no estimate and no quote. A new "print" permission area runs it.
--
-- submitted → quoted → accepted → printing → ready → delivered
--          ↘ rejected (by the team, with a reason)   quoted → declined (by the student)
--   submitted/quoted → cancelled (by the student)

create table if not exists public.print_settings (
  id smallint primary key default 1 check (id = 1),
  open boolean not null default false,
  -- [{ key, name, name_en, colors: [..], density (g/cm³), price_per_gram (EGP) }]
  materials jsonb not null default '[{"key":"pla","name":"PLA","name_en":"PLA","colors":["أبيض","أسود"],"density":1.24,"price_per_gram":null},{"key":"petg","name":"PETG","name_en":"PETG","colors":["أسود"],"density":1.27,"price_per_gram":null}]'
    check (jsonb_typeof(materials) = 'array' and jsonb_array_length(materials) between 1 and 12),
  price_per_hour numeric check (price_per_hour >= 0),
  min_fee numeric check (min_fee >= 0),
  note text not null default '' check (char_length(note) <= 600),
  updated_at timestamptz not null default now()
);
insert into public.print_settings (id) values (1) on conflict do nothing;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'BXP-' || upper(encode(extensions.gen_random_bytes(3), 'hex')),
  student_id uuid not null references public.students(id) on delete cascade,
  file_path text not null check (file_path ~ '^prints/[0-9a-f-]{36}/[0-9a-f-]{36}\.(stl|3mf|obj)$'),
  file_name text not null check (char_length(file_name) between 1 and 120),
  file_size bigint not null check (file_size between 1 and 20971520),
  est_volume numeric check (est_volume >= 0),            -- cm³, measured from the mesh in the app
  bbox jsonb check (bbox is null or jsonb_typeof(bbox) = 'array'), -- [x, y, z] mm
  material text not null check (material ~ '^[a-z0-9-]{2,20}$'),
  color text not null default '' check (char_length(color) <= 40),
  quality text not null default 'normal' check (quality in ('draft', 'normal', 'fine')),
  infill int not null default 20 check (infill between 5 and 100),
  quantity int not null default 1 check (quantity between 1 and 20),
  notes text not null default '' check (char_length(notes) <= 600),
  status text not null default 'submitted' check (status in ('submitted', 'quoted', 'accepted', 'printing', 'ready', 'delivered', 'declined', 'cancelled', 'rejected')),
  slicer text check (char_length(slicer) <= 40),
  slicer_grams numeric check (slicer_grams > 0),
  slicer_minutes int check (slicer_minutes > 0),
  price numeric check (price >= 0),
  quote_note text check (char_length(quote_note) <= 300),
  reason text check (char_length(reason) <= 300),
  quoted_by uuid references auth.users(id) on delete set null,
  quoted_at timestamptz,
  accepted_at timestamptz,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists print_jobs_student on public.print_jobs (student_id, created_at desc);
create index if not exists print_jobs_status on public.print_jobs (status, created_at);
create index if not exists print_jobs_quoted_by on public.print_jobs (quoted_by);

alter table public.print_settings enable row level security;
alter table public.print_jobs enable row level security;
revoke all on public.print_settings, public.print_jobs from anon, authenticated;
create trigger print_jobs_audit after insert or update or delete on public.print_jobs for each row execute function private.audit();

-- The team running the Print Hub can download the files.
alter policy submissions_objects_select on storage.objects
  using (bucket_id = 'submissions' and ((select private.can_read('tasks')) or ((select private.can_read('site')) and name like 'projects/%')
                                        or ((select private.can_read('print')) and name like 'prints/%')));

/** The Hub's materials and rates (what the app needs for its estimate) — public. */
create or replace function public.print_hub_info()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('open', s.open, 'materials', s.materials, 'price_per_hour', s.price_per_hour, 'min_fee', s.min_fee, 'note', s.note,
                            'priced', not exists (select 1 from jsonb_array_elements(s.materials) m where m->'price_per_gram' is null or m->'price_per_gram' = 'null'::jsonb)
                                      and s.price_per_hour is not null)
    from public.print_settings s where s.id = 1
$$;

/** Edge Function only (student-upload): where a student's print file goes. */
create or replace function public.student_print_upload_ticket(p_token text, p_ext text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  v_ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-zA-Z0-9]', '', 'g'));
begin
  if not (select open from public.print_settings where id = 1) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if not private.throttle('print_upload:' || v_id, 10, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_ext not in ('stl', '3mf', 'obj') then return jsonb_build_object('ok', false, 'error', 'type'); end if;
  if p_size is null or p_size <= 0 or p_size > 20971520 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  return jsonb_build_object('ok', true, 'path', 'prints/' || v_id || '/' || gen_random_uuid() || '.' || v_ext);
end $$;

/** A student sends the uploaded file to be printed (at most three open requests). */
create or replace function public.student_print_submit(p_token text, p_path text, p_name text, p_size bigint, p_volume numeric, p_bbox jsonb,
                                                       p_material text, p_color text, p_quality text, p_infill int, p_quantity int, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  s public.print_settings;
  v_code text;
begin
  select * into s from public.print_settings where id = 1;
  if not s.open then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_path is null or p_path not like 'prints/' || v_id || '/%' then return jsonb_build_object('ok', false, 'error', 'file'); end if;
  if not exists (select 1 from jsonb_array_elements(s.materials) m where m->>'key' = p_material) then return jsonb_build_object('ok', false, 'error', 'material'); end if;
  if (select count(*) from public.print_jobs where student_id = v_id and status in ('submitted', 'quoted', 'accepted', 'printing')) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.print_jobs (student_id, file_path, file_name, file_size, est_volume, bbox, material, color, quality, infill, quantity, notes)
  values (v_id, p_path, left(btrim(coalesce(p_name, 'model')), 120), p_size, p_volume, p_bbox, p_material, left(coalesce(p_color, ''), 40),
          coalesce(p_quality, 'normal'), coalesce(p_infill, 20), coalesce(p_quantity, 1), left(coalesce(p_notes, ''), 600))
  returning code into v_code;
  perform private.notify_staff('print', 'طلب طباعة جديد', v_code || ' · ' || left(p_name, 60), '/app/#/staff/print');
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

/** A student's print requests. */
create or replace function public.student_print_jobs(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', j.id, 'code', j.code, 'file_name', j.file_name, 'material', j.material, 'color', j.color, 'quality', j.quality, 'infill', j.infill,
             'quantity', j.quantity, 'est_volume', j.est_volume, 'status', j.status, 'slicer', j.slicer, 'grams', j.slicer_grams, 'minutes', j.slicer_minutes,
             'price', j.price, 'quote_note', j.quote_note, 'reason', j.reason, 'paid', j.paid, 'created_at', j.created_at, 'updated_at', j.updated_at)
           order by j.created_at desc)
      from public.print_jobs j where j.student_id = v_id), '[]');
end $$;

/** The student accepts or declines the quoted price; or cancels a request not yet accepted. */
create or replace function public.student_print_answer(p_token text, p_job uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.session_student(p_token);
  j public.print_jobs;
begin
  select * into j from public.print_jobs where id = p_job and student_id = v_id;
  if j.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_answer in ('accept', 'decline') and j.status = 'quoted' then
    update public.print_jobs set status = case when p_answer = 'accept' then 'accepted' else 'declined' end,
                                 accepted_at = case when p_answer = 'accept' then now() end, updated_at = now()
     where id = j.id;
    if p_answer = 'accept' then
      perform private.notify_staff('print', 'طالب وافق على سعر الطباعة', j.code || ' · ' || j.price || ' ج', '/app/#/staff/print');
    end if;
  elsif p_answer = 'cancel' and j.status in ('submitted', 'quoted') then
    update public.print_jobs set status = 'cancelled', updated_at = now() where id = j.id;
  else
    return jsonb_build_object('ok', false, 'error', 'state');
  end if;
  return jsonb_build_object('ok', true);
end $$;

/* ─── Team ─────────────────────────────────────────────────────────────── */

create or replace function public.staff_print_jobs()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('print') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.print_settings s where s.id = 1),
    'jobs', coalesce((
      select jsonb_agg(to_jsonb(j) || jsonb_build_object('student', st.full_name, 'student_code', st.code, 'group', st.group_name)
             order by j.status in ('delivered', 'declined', 'cancelled', 'rejected'), j.created_at desc)
        from public.print_jobs j join public.students st on st.id = j.student_id
       where j.created_at > now() - interval '180 days'), '[]'));
end $$;

/**
 * The quote, from what the slicer reported for the whole order: filament grams and print minutes.
 * price = grams × the material's price per gram + hours × the machine rate, at least the minimum,
 * rounded up to a whole pound. Refused while the rates aren't set.
 */
create or replace function public.staff_print_quote(p_job uuid, p_slicer text, p_grams numeric, p_minutes int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.print_settings;
  j public.print_jobs;
  v_ppg numeric;
  v_price numeric;
begin
  if not private.can('print') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_slicer), '') = '' or p_grams is null or p_grams <= 0 or p_minutes is null or p_minutes <= 0 then
    return jsonb_build_object('ok', false, 'error', 'slicer');
  end if;
  select * into s from public.print_settings where id = 1;
  select * into j from public.print_jobs where id = p_job and status in ('submitted', 'quoted');
  if j.id is null then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  select (m->>'price_per_gram')::numeric into v_ppg from jsonb_array_elements(s.materials) m where m->>'key' = j.material;
  if v_ppg is null or s.price_per_hour is null then return jsonb_build_object('ok', false, 'error', 'prices_not_set'); end if;
  v_price := ceil(greatest(coalesce(s.min_fee, 0), p_grams * v_ppg + (p_minutes / 60.0) * s.price_per_hour));
  update public.print_jobs
     set status = 'quoted', slicer = left(btrim(p_slicer), 40), slicer_grams = p_grams, slicer_minutes = p_minutes, price = v_price,
         quote_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), quoted_by = auth.uid(), quoted_at = now(), updated_at = now()
   where id = j.id;
  perform private.notify_student_ids(array[j.student_id], 'سعر طباعة ' || j.code, v_price || ' ج — وافق عليه عشان نبدأ', '/app/#/me/print');
  return jsonb_build_object('ok', true, 'price', v_price);
end $$;

/** Move an accepted job along (printing → ready → delivered), or reject a request with a reason. */
create or replace function public.staff_print_status(p_job uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.print_jobs;
begin
  if not private.can('print') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from public.print_jobs where id = p_job;
  if j.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not ((p_status = 'printing' and j.status = 'accepted') or (p_status = 'ready' and j.status = 'printing')
          or (p_status = 'delivered' and j.status = 'ready') or (p_status = 'rejected' and j.status in ('submitted', 'quoted'))) then
    return jsonb_build_object('ok', false, 'error', 'state');
  end if;
  if p_status = 'rejected' and char_length(btrim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'reason'); end if;
  update public.print_jobs set status = p_status, reason = case when p_status = 'rejected' then left(btrim(p_reason), 300) else reason end, updated_at = now()
   where id = j.id;
  if p_status in ('ready', 'rejected') then
    perform private.notify_student_ids(array[j.student_id],
      case when p_status = 'ready' then 'طباعتك جاهزة ' || j.code else 'طلب الطباعة ' || j.code || ' اترفض' end,
      case when p_status = 'ready' then 'استلمها من فريق BuildX' else left(btrim(p_reason), 200) end, '/app/#/me/print');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.staff_print_paid(p_job uuid, p_paid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('print') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.print_jobs set paid = p_paid, paid_at = case when p_paid then now() end, updated_at = now()
   where id = p_job and status in ('accepted', 'printing', 'ready', 'delivered');
  if not found then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  return jsonb_build_object('ok', true);
end $$;

/** The team sets the materials, colours and rates (and opens or closes the Hub). */
create or replace function public.staff_print_settings_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('print') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p->'materials') <> 'array' or exists (
       select 1 from jsonb_array_elements(p->'materials') m
        where coalesce(m->>'key', '') !~ '^[a-z0-9-]{2,20}$' or coalesce(btrim(m->>'name'), '') = ''
           or jsonb_typeof(m->'colors') <> 'array' or coalesce((m->>'density')::numeric, 0) not between 0.5 and 3
           or (m->'price_per_gram' is not null and m->'price_per_gram' <> 'null'::jsonb and (m->>'price_per_gram')::numeric < 0)) then
    return jsonb_build_object('ok', false, 'error', 'materials');
  end if;
  update public.print_settings
     set open = coalesce((p->>'open')::boolean, false), materials = p->'materials',
         price_per_hour = nullif(p->>'price_per_hour', '')::numeric, min_fee = nullif(p->>'min_fee', '')::numeric,
         note = left(coalesce(p->>'note', ''), 600), updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.print_hub_info(), public.student_print_upload_ticket(text, text, bigint),
  public.student_print_submit(text, text, text, bigint, numeric, jsonb, text, text, text, int, int, text), public.student_print_jobs(text),
  public.student_print_answer(text, uuid, text), public.staff_print_jobs(), public.staff_print_quote(uuid, text, numeric, int, text),
  public.staff_print_status(uuid, text, text), public.staff_print_paid(uuid, boolean), public.staff_print_settings_save(jsonb) from public;
grant execute on function public.print_hub_info(), public.student_print_submit(text, text, text, bigint, numeric, jsonb, text, text, text, int, int, text),
  public.student_print_jobs(text), public.student_print_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.student_print_upload_ticket(text, text, bigint) to service_role;
grant execute on function public.staff_print_jobs(), public.staff_print_quote(uuid, text, numeric, int, text), public.staff_print_status(uuid, text, text),
  public.staff_print_paid(uuid, boolean), public.staff_print_settings_save(jsonb) to authenticated;
