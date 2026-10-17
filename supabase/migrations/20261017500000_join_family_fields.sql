-- The join form asks for what the Student Welfare family list needs (national ID, governorate, full
-- address), people who apply again show on their first application, and accepting an applicant puts
-- them on this year's family list.

alter table public.applications
  add column if not exists national_id text,
  add column if not exists governorate text,
  add column if not exists address text,
  add column if not exists repeats int not null default 0,
  add column if not exists last_repeat_at timestamptz;
alter table public.applications
  add constraint applications_national_id_check check (national_id ~ '^[23][0-9]{13}$'),
  add constraint applications_governorate_check check (char_length(governorate) between 2 and 40),
  add constraint applications_address_check check (char_length(address) between 2 and 200);

-- The editor may set the new questions too.
select private.patch_function('public.staff_apply_form_save(jsonb)',
  $p$'hours_per_week','days','heard_from'])$p$,
  $p$'hours_per_week','days','heard_from','national_id','governorate','address'])$p$);

-- submit_application: read, check and keep the new answers; count a repeat on the first application.
select private.patch_function('public.submit_application(jsonb)',
  $p$f_url text; f_roles text[]; f_motivation text; f_goals text; f_hours text; f_days text[]; f_heard text;$p$,
  $p$f_url text; f_roles text[]; f_motivation text; f_goals text; f_hours text; f_days text[]; f_heard text;
  f_nid text; f_gov text; f_addr text;$p$);

select private.patch_function('public.submit_application(jsonb)',
  $p$  if (f_faculty is null and private.apply_flag(v_fields, 'faculty', 'required', true)$p$,
  $p$  f_nid := case when private.apply_flag(v_fields, 'national_id', 'hidden', false) then null
    else nullif(regexp_replace(translate(coalesce(p ->> 'national_id', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g'), '') end;
  f_gov := case when private.apply_flag(v_fields, 'governorate', 'hidden', false) then null else nullif(btrim(p ->> 'governorate'), '') end;
  f_addr := case when private.apply_flag(v_fields, 'address', 'hidden', false) then null
    else nullif(btrim(regexp_replace(coalesce(p ->> 'address', ''), '\s+', ' ', 'g')), '') end;
  -- Required only when the team's setup says so (older pages don't send them).
  if (f_nid is null and private.apply_flag(v_fields, 'national_id', 'required', false) and not private.apply_flag(v_fields, 'national_id', 'hidden', false))
     or (f_gov is null and private.apply_flag(v_fields, 'governorate', 'required', false) and not private.apply_flag(v_fields, 'governorate', 'hidden', false))
     or (f_addr is null and private.apply_flag(v_fields, 'address', 'required', false) and not private.apply_flag(v_fields, 'address', 'hidden', false))
     or (f_nid is not null and not private.national_id_ok(f_nid))
     or (f_gov is not null and char_length(f_gov) not between 2 and 40)
     or (f_addr is not null and char_length(f_addr) not between 2 and 200) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (f_faculty is null and private.apply_flag(v_fields, 'faculty', 'required', true)$p$);

select private.patch_function('public.submit_application(jsonb)',
  $p$  if v_ref is not null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;$p$,
  $p$  if v_ref is not null then
    -- Applied again within a week: counted on the first application, so the team sees it.
    update public.applications set repeats = repeats + 1, last_repeat_at = now() where ref = v_ref;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;$p$);

select private.patch_function('public.submit_application(jsonb)',
  $p$motivation, goals, hours_per_week, days, heard_from, consent, answers$p$,
  $p$motivation, goals, hours_per_week, days, heard_from, consent, answers, national_id, governorate, address$p$);

select private.patch_function('public.submit_application(jsonb)',
  $p$      v_out
    );$p$,
  $p$      v_out, f_nid, f_gov, f_addr
    );$p$);

-- Accepting someone who gave the family-list data puts them on this year's family list (once).
create or replace function private.family_from_application(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.applications%rowtype;
  v_settings jsonb := coalesce((select value from public.site_settings where key = 'family'), '{}'::jsonb);
  v_year text := coalesce(nullif(v_settings ->> 'year', ''), private.current_academic_year());
  v_phone text;
  v_level int;
  v_faculty text;
  v_ref text;
begin
  if not (private.can('applications') or private.is_admin()) then
    return;
  end if;
  select * into a from public.applications where id = p_id;
  if not found or a.national_id is null or a.governorate is null or a.address is null then
    return;
  end if;
  v_phone := regexp_replace(a.phone, '[^0-9]', '', 'g');
  if v_phone ~ '^(20|0020)1[0125][0-9]{8}$' then
    v_phone := '0' || right(v_phone, 10);
  end if;
  v_level := case when a.academic_year ~ '^[1-5]$' then a.academic_year::int end;
  v_faculty := coalesce(nullif(btrim(a.faculty), ''), nullif(btrim(v_settings ->> 'faculty'), ''));
  if v_phone !~ '^01[0125][0-9]{8}$' or v_level is null or v_faculty is null then
    return;
  end if;
  if exists (select 1 from public.family_members where academic_year = v_year and national_id = a.national_id) then
    update public.family_members set student_id = coalesce(student_id, a.student_id)
     where academic_year = v_year and national_id = a.national_id;
    return;
  end if;
  for i in 1..5 loop
    v_ref := 'FM-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.family_members where ref = v_ref);
  end loop;
  insert into public.family_members (ref, academic_year, full_name, national_id, phone, governorate, address, level,
                                     faculty, student_number, email, status, notes, student_id, locale)
  values (v_ref, v_year, left(a.full_name, 120), a.national_id, v_phone, a.governorate, a.address, v_level,
          left(v_faculty, 120), left(a.student_number, 40), nullif(left(a.email, 200), ''), 'accepted',
          'من طلب الانضمام ' || a.ref, a.student_id, a.locale);
exception when others then
  -- The family list is a help; accepting never fails because of it.
  return;
end $$;
revoke all on function private.family_from_application(uuid) from public, anon;
grant execute on function private.family_from_application(uuid) to authenticated;

select private.patch_function('public.accept_application(uuid,text,text)',
  $p$  update public.applications set status = 'accepted', student_id = v_id where id = p_id;$p$,
  $p$  update public.applications set status = 'accepted', student_id = v_id where id = p_id;
  perform private.family_from_application(p_id);$p$);
