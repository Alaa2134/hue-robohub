-- The join form, set up from the app: questions can be renamed, made optional or required, hidden,
-- given other choices, and extra questions can be added (site_settings «apply_form»).
-- Answers to extra questions are kept on the application as [{id, q, a}] (q = the question as asked).

alter table public.applications add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.applications add constraint applications_answers_check
  check (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 30000);

-- Questions the team may hide or make optional.
alter table public.applications
  alter column faculty drop not null,
  alter column academic_year drop not null,
  alter column experience_level drop not null,
  alter column motivation drop not null,
  alter column hours_per_week drop not null;
-- Choices the team may change (stored keys are no longer a fixed list); a short answer may be enough.
alter table public.applications
  drop constraint applications_experience_level_check,
  drop constraint applications_hours_per_week_check,
  drop constraint applications_motivation_check;
alter table public.applications
  add constraint applications_experience_level_check check (char_length(experience_level) between 1 and 60),
  add constraint applications_hours_per_week_check check (char_length(hours_per_week) between 1 and 60),
  add constraint applications_motivation_check check (char_length(motivation) between 1 and 2000);

-- Whoever reviews applications (full access) saves the form; everyone may read it (the website does).
create or replace function public.staff_apply_form_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q jsonb;
  k text;
begin
  if not (private.can('applications') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 60000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if p ? 'fields' then
    if jsonb_typeof(p -> 'fields') <> 'object' then raise exception 'invalid' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(p -> 'fields') loop
      if k <> all (array['full_name','phone','email','faculty','academic_year','student_number','track_first','track_second',
                         'experience_level','skills','experience','portfolio_url','team_roles','motivation','goals',
                         'hours_per_week','days','heard_from']) then
        raise exception 'unknown field %', k using errcode = '22023';
      end if;
    end loop;
  end if;
  if p ? 'extra' then
    if jsonb_typeof(p -> 'extra') <> 'array' or jsonb_array_length(p -> 'extra') > 25 then
      raise exception 'invalid' using errcode = '22023';
    end if;
    for q in select * from jsonb_array_elements(p -> 'extra') loop
      if coalesce(q ->> 'id', '') !~ '^q_[a-z0-9]{4,16}$'
         or coalesce(q ->> 'type', '') <> all (array['text','textarea','select','multi','yesno','number','url','date'])
         or char_length(btrim(coalesce(q ->> 'label_ar', ''))) not between 1 and 300
         or coalesce(q ->> 'step', '') not in ('0','1','2')
         or ((q ->> 'type') in ('select','multi') and (jsonb_typeof(q -> 'options') is distinct from 'array'
              or jsonb_array_length(q -> 'options') not between 1 and 30)) then
        raise exception 'invalid question' using errcode = '22023';
      end if;
    end loop;
  end if;
  insert into public.site_settings (key, value, updated_at, updated_by)
  values ('apply_form', p, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return p;
end $$;
revoke all on function public.staff_apply_form_save(jsonb) from public, anon;
grant execute on function public.staff_apply_form_save(jsonb) to authenticated;

-- A yes/no setting of a built-in question («hidden», «required»), its default when unset or not a boolean.
create or replace function private.apply_flag(f jsonb, k text, flag text, d boolean)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(f -> k -> flag) = 'boolean' then (f -> k ->> flag)::boolean end, d)
$$;
revoke all on function private.apply_flag(jsonb, text, text, boolean) from public, anon, authenticated;

-- The submission follows the form as it is set up now.
create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_ref text;
  v_recent int;
  v_cfg jsonb := coalesce((select value from public.site_settings where key = 'apply_form'), '{}'::jsonb);
  v_fields jsonb;
  v_ans jsonb;
  v_out jsonb := '[]'::jsonb;
  v_val text;
  v_vals text[];
  v_opts text[];
  v_req boolean;
  q jsonb;
  -- Answers to built-in questions after hiding (null = hidden or left empty).
  f_faculty text; f_year text; f_student text; f_track2 text; f_level text; f_skills text; f_exp text;
  f_url text; f_roles text[]; f_motivation text; f_goals text; f_hours text; f_days text[]; f_heard text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Outside the exception block below, so rejected (invalid) submissions still count.
  if not private.throttle('apply', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce((select (value ->> 'open')::boolean from public.site_settings where key = 'applications'), true) is false then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'apply'));
    return jsonb_build_object('ok', true, 'ref', 'BX-000000');
  end if;
  if v_phone ~ '^01[0-9]{9}$' then
    v_phone := '+2' || v_phone;
  elsif v_phone ~ '^00[0-9]+$' then
    v_phone := '+' || substr(v_phone, 3);
  end if;

  if jsonb_typeof(v_cfg) <> 'object' then v_cfg := '{}'::jsonb; end if;
  v_fields := case when jsonb_typeof(v_cfg -> 'fields') = 'object' then v_cfg -> 'fields' else '{}'::jsonb end;

  -- Built-in questions: hidden ones are dropped, required ones must be answered.
  f_faculty := case when private.apply_flag(v_fields, 'faculty', 'hidden', false) then null else nullif(btrim(p ->> 'faculty'), '') end;
  f_year := case when private.apply_flag(v_fields, 'academic_year', 'hidden', false) then null else nullif(btrim(p ->> 'academic_year'), '') end;
  f_student := case when private.apply_flag(v_fields, 'student_number', 'hidden', false) then null else nullif(btrim(p ->> 'student_number'), '') end;
  f_track2 := case when private.apply_flag(v_fields, 'track_second', 'hidden', false) then null else nullif(btrim(p ->> 'track_second'), '') end;
  f_level := case when private.apply_flag(v_fields, 'experience_level', 'hidden', false) then null else nullif(btrim(p ->> 'experience_level'), '') end;
  f_skills := case when private.apply_flag(v_fields, 'skills', 'hidden', false) then null else nullif(btrim(p ->> 'skills'), '') end;
  f_exp := case when private.apply_flag(v_fields, 'experience', 'hidden', false) then null else nullif(btrim(p ->> 'experience'), '') end;
  f_url := case when private.apply_flag(v_fields, 'portfolio_url', 'hidden', false) then null else nullif(btrim(p ->> 'portfolio_url'), '') end;
  f_motivation := case when private.apply_flag(v_fields, 'motivation', 'hidden', false) then null else nullif(btrim(p ->> 'motivation'), '') end;
  f_goals := case when private.apply_flag(v_fields, 'goals', 'hidden', false) then null else nullif(btrim(p ->> 'goals'), '') end;
  f_hours := case when private.apply_flag(v_fields, 'hours_per_week', 'hidden', false) then null else nullif(btrim(p ->> 'hours_per_week'), '') end;
  f_heard := case when private.apply_flag(v_fields, 'heard_from', 'hidden', false) then null else nullif(btrim(p ->> 'heard_from'), '') end;
  f_roles := case when private.apply_flag(v_fields, 'team_roles', 'hidden', false) then '{}'
    else coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'team_roles') = 'array' then p -> 'team_roles' else '[]'::jsonb end) x where btrim(x) <> ''), '{}') end;
  f_days := case when private.apply_flag(v_fields, 'days', 'hidden', false) then '{}'
    else coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'days') = 'array' then p -> 'days' else '[]'::jsonb end) x where btrim(x) <> ''), '{}') end;

  if (f_faculty is null and private.apply_flag(v_fields, 'faculty', 'required', true) and not private.apply_flag(v_fields, 'faculty', 'hidden', false))
     or (f_year is null and private.apply_flag(v_fields, 'academic_year', 'required', true) and not private.apply_flag(v_fields, 'academic_year', 'hidden', false))
     or (f_student is null and private.apply_flag(v_fields, 'student_number', 'required', false) and not private.apply_flag(v_fields, 'student_number', 'hidden', false))
     or (f_track2 is null and private.apply_flag(v_fields, 'track_second', 'required', false) and not private.apply_flag(v_fields, 'track_second', 'hidden', false))
     or (f_level is null and private.apply_flag(v_fields, 'experience_level', 'required', true) and not private.apply_flag(v_fields, 'experience_level', 'hidden', false))
     or (f_skills is null and private.apply_flag(v_fields, 'skills', 'required', false) and not private.apply_flag(v_fields, 'skills', 'hidden', false))
     or (f_exp is null and private.apply_flag(v_fields, 'experience', 'required', false) and not private.apply_flag(v_fields, 'experience', 'hidden', false))
     or (f_url is null and private.apply_flag(v_fields, 'portfolio_url', 'required', false) and not private.apply_flag(v_fields, 'portfolio_url', 'hidden', false))
     or (cardinality(f_roles) = 0 and private.apply_flag(v_fields, 'team_roles', 'required', false) and not private.apply_flag(v_fields, 'team_roles', 'hidden', false))
     or (f_goals is null and private.apply_flag(v_fields, 'goals', 'required', false) and not private.apply_flag(v_fields, 'goals', 'hidden', false))
     or (f_hours is null and private.apply_flag(v_fields, 'hours_per_week', 'required', true) and not private.apply_flag(v_fields, 'hours_per_week', 'hidden', false))
     or (cardinality(f_days) = 0 and private.apply_flag(v_fields, 'days', 'required', false) and not private.apply_flag(v_fields, 'days', 'hidden', false))
     or (f_heard is null and private.apply_flag(v_fields, 'heard_from', 'required', false) and not private.apply_flag(v_fields, 'heard_from', 'hidden', false))
     -- A required «why» still needs a few real sentences.
     or (private.apply_flag(v_fields, 'motivation', 'required', true) and not private.apply_flag(v_fields, 'motivation', 'hidden', false)
         and char_length(coalesce(f_motivation, '')) < 20) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if f_url is not null and f_url !~ '^https?://\S+\.\S+' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Extra questions: only the ones on the form now, each answer checked against its type.
  v_ans := case when jsonb_typeof(p -> 'answers') = 'object' then p -> 'answers' else '{}'::jsonb end;
  for q in select * from jsonb_array_elements(case when jsonb_typeof(v_cfg -> 'extra') = 'array' then v_cfg -> 'extra' else '[]'::jsonb end) loop
    v_req := coalesce(case when jsonb_typeof(q -> 'required') = 'boolean' then (q ->> 'required')::boolean end, false);
    v_val := null;
    v_opts := array(select o ->> 'ar' from jsonb_array_elements(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' else '[]'::jsonb end) o);
    if q ->> 'type' = 'multi' then
      v_vals := array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(v_ans -> (q ->> 'id')) = 'array' then v_ans -> (q ->> 'id') else '[]'::jsonb end) x where x = any (v_opts));
      v_val := nullif(array_to_string(v_vals, '، '), '');
    else
      v_val := nullif(btrim(case when jsonb_typeof(v_ans -> (q ->> 'id')) in ('string', 'number') then v_ans ->> (q ->> 'id') else '' end), '');
      if v_val is not null then
        v_val := case q ->> 'type'
          when 'select' then case when v_val = any (v_opts) then v_val end
          when 'yesno' then case v_val when 'yes' then 'نعم' when 'no' then 'لا' end
          when 'number' then case when v_val ~ '^-?[0-9]{1,12}([.,][0-9]{1,4})?$' then v_val end
          when 'url' then case when v_val ~ '^https?://\S+\.\S+' and char_length(v_val) <= 300 then v_val end
          when 'date' then case when v_val ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_val end
          when 'textarea' then left(v_val, 2000)
          else left(v_val, 300)
        end;
        -- Something was sent that doesn't fit the question.
        if v_val is null then
          return jsonb_build_object('ok', false, 'error', 'invalid');
        end if;
      end if;
    end if;
    if v_val is null and v_req then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if v_val is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', q ->> 'id', 'q', left(q ->> 'label_ar', 300), 'a', v_val));
    end if;
  end loop;

  select count(*) into v_recent from public.applications where created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    perform private.log_security('apply_flood', 3, jsonb_build_object('last_minute', v_recent));
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  select ref into v_ref from public.applications
   where (phone = v_phone or lower(email) = v_email) and created_at > now() - interval '7 days'
   order by created_at desc limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  for i in 1..5 loop
    v_ref := 'BX-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.applications where ref = v_ref);
  end loop;

  begin
    if private.is_banned(v_phone, null) then
      return jsonb_build_object('ok', false, 'error', 'banned');
    end if;
    insert into public.applications (
      ref, locale, full_name, phone, email, faculty, academic_year, student_number,
      track_first, track_second, team_roles, experience_level, skills, experience, portfolio_url,
      motivation, goals, hours_per_week, days, heard_from, consent, answers
    ) values (
      v_ref,
      case when p ->> 'locale' = 'en' then 'en' else 'ar' end,
      btrim(p ->> 'full_name'),
      v_phone,
      v_email,
      f_faculty, f_year, f_student,
      btrim(p ->> 'track_first'),
      f_track2, f_roles, f_level, f_skills, f_exp, f_url,
      f_motivation, f_goals, f_hours, f_days, f_heard,
      coalesce((p ->> 'consent')::boolean, false),
      v_out
    );
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_parameter_value or string_data_right_truncation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true, 'ref', v_ref);
end $function$;
