-- Forms polish: a national-ID question type (checked like the family list), Arabic digits accepted
-- in numbers, and the public forms list only shows forms that are open now or will open later
-- (a form switched "open" whose closing time passed no longer shows as "soon"), open ones first.

create or replace function public.public_forms()
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', f.slug, 'title_ar', f.title_ar, 'title_en', f.title_en, 'intro_ar', f.intro_ar, 'intro_en', f.intro_en,
    'team', f.team, 'listed', f.listed, 'open', private.form_is_open(f), 'opens_at', f.opens_at, 'closes_at', f.closes_at,
    'questions', jsonb_array_length(f.fields)
  ) order by private.form_is_open(f) desc, f.created_at desc), '[]')
  from public.forms f
  where not f.archived and (private.form_is_open(f) or (f.opens_at is not null and f.opens_at > now()))
$$;

create or replace function public.submit_form(p_slug text, p_answers jsonb, p_locale text default 'ar', p_website text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  f public.forms;
  fld jsonb;
  v_id text;
  v_type text;
  v_val jsonb;
  v_text text;
  v_clean jsonb := '{}';
  v_name text;
  v_phone text;
  v_email text;
  v_student uuid;
  v_errors jsonb := '{}';
  v_files text[] := '{}';
  v_pass text;
begin
  if not private.throttle('form', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p_website, '') <> '' or (jsonb_typeof(p_answers) = 'object' and private.form_ms(p_answers ->> '__t') < 1500) then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', p_slug));
    return jsonb_build_object('ok', true);
  end if;
  select * into f from public.forms where slug = lower(btrim(p_slug)) and not archived;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not private.form_is_open(f) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  for fld in select * from jsonb_array_elements(f.fields) loop
    v_id := fld ->> 'id';
    v_type := coalesce(fld ->> 'type', 'text');
    v_val := p_answers -> v_id;
    if v_type = 'multi' then
      if v_val is not null and jsonb_typeof(v_val) <> 'array' then v_val := null; end if;
      if v_val is not null then
        select coalesce(jsonb_agg(x), '[]') into v_val from jsonb_array_elements_text(v_val) x
         where x in (select o ->> 'ar' from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o);
      end if;
      if coalesce((fld ->> 'required')::boolean, false) and coalesce(jsonb_array_length(v_val), 0) = 0 then
        v_errors := v_errors || jsonb_build_object(v_id, 'required');
      elsif v_val is not null and jsonb_array_length(v_val) > 0 then
        v_clean := v_clean || jsonb_build_object(v_id, v_val);
      end if;
      continue;
    end if;
    if v_type = 'file' then
      v_text := nullif(btrim(v_val #>> '{}'), '');
      if v_text is null then
        if coalesce((fld ->> 'required')::boolean, false) then v_errors := v_errors || jsonb_build_object(v_id, 'required'); end if;
      elsif private.form_file_ok(f.id, v_id, v_text) then
        v_files := array_append(v_files, v_text);
        v_clean := v_clean || jsonb_build_object(v_id, v_text);
      else
        v_errors := v_errors || jsonb_build_object(v_id, 'file');
      end if;
      continue;
    end if;
    v_text := case when v_type = 'checkbox' then (case when v_val = 'true'::jsonb then 'نعم' else null end) else nullif(btrim(v_val #>> '{}'), '') end;
    -- Numbers typed on an Arabic keyboard (٠١٢… or ۰۱۲…) count as 0-9.
    if v_type in ('nid', 'number') and v_text is not null then
      v_text := translate(v_text, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    end if;
    if v_type = 'nid' and v_text is not null then
      v_text := nullif(regexp_replace(v_text, '[^0-9]', '', 'g'), '');
    end if;
    if v_text is null then
      if coalesce((fld ->> 'required')::boolean, false) then v_errors := v_errors || jsonb_build_object(v_id, 'required'); end if;
      continue;
    end if;
    if char_length(v_text) > (case when v_type = 'textarea' then 4000 else 500 end) then
      v_errors := v_errors || jsonb_build_object(v_id, 'too_long');
      continue;
    end if;
    if v_type = 'email' and v_text !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'email'); continue;
    end if;
    if v_type = 'phone' then
      v_text := private.clean_phone(v_text);
      if v_text is null or v_text !~ '^\+?[0-9]{7,16}$' then v_errors := v_errors || jsonb_build_object(v_id, 'phone'); continue; end if;
    end if;
    if v_type = 'nid' and not private.national_id_ok(v_text) then
      v_errors := v_errors || jsonb_build_object(v_id, 'nid'); continue;
    end if;
    if v_type = 'member' then
      select s.id, s.code into v_student, v_text from public.students s where s.active and (s.member_until is null or s.member_until >= private.cairo_today()) and (s.code_key = private.code_key(v_text) or s.card_token = private.card_of(v_text));
      if v_student is null then v_errors := v_errors || jsonb_build_object(v_id, 'member'); continue; end if;
    end if;
    if v_type = 'number' and v_text !~ '^-?[0-9]+([.][0-9]+)?$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'number'); continue;
    end if;
    if v_type = 'url' and v_text !~* '^https?://[^\s]+$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'url'); continue;
    end if;
    if v_type = 'date' and v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_errors := v_errors || jsonb_build_object(v_id, 'date'); continue;
    end if;
    if v_type = 'select' and v_text not in (select o ->> 'ar' from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o) then
      v_errors := v_errors || jsonb_build_object(v_id, 'option'); continue;
    end if;
    v_clean := v_clean || jsonb_build_object(v_id, v_text);
    if v_type = 'name' and v_name is null then v_name := v_text; end if;
    if v_type = 'phone' and v_phone is null then v_phone := v_text; end if;
    if v_type = 'email' and v_email is null then v_email := lower(v_text); end if;
  end loop;

  if v_errors <> '{}' then
    return jsonb_build_object('ok', false, 'error', 'fields', 'fields', v_errors);
  end if;
  if private.is_banned(v_phone, v_student) then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;
  if (v_phone is not null or v_email is not null or v_student is not null) and exists (
    select 1 from public.form_responses where form_id = f.id and (phone = v_phone or email = v_email or student_id = v_student)
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'ref',
      (select r.ref from public.form_responses r where r.form_id = f.id and (r.phone = v_phone or r.email = v_email or r.student_id = v_student) order by r.created_at limit 1));
  end if;
  insert into public.form_responses (form_id, answers, name, phone, email, locale, student_id)
  values (f.id, v_clean, v_name, v_phone, v_email, case when p_locale = 'en' then 'en' else 'ar' end, v_student)
  returning ref, pass into v_text, v_pass;
  update private.form_uploads set used_at = now() where path = any(v_files);
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'ref', v_text, 'pass', v_pass));
end $function$;
