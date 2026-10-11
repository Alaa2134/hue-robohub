-- أسرة BuildX: students sign up as members of the student family (أسرة) on the website, with what the
-- Student Welfare Department's list asks for: full name, national ID, address, phone and study level.
-- Staff with the applications area see the list in the app and print it in the department's layout.
--  * family_members: one row per student per academic year (the national ID is unique within a year).
--  * submit_family(p): the public form (rate-limited, honeypot, checks the national ID and phone).
--  * staff_family_settings(p): open/close the form, the academic year, the family and faculty names.
-- Settings live in site_settings key 'family' (readable by the website like the other keys).

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  academic_year text not null check (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  full_name text not null check (char_length(full_name) between 5 and 120),
  national_id text not null check (national_id ~ '^[23][0-9]{13}$'),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  governorate text not null check (char_length(governorate) between 2 and 40),
  address text not null check (char_length(address) between 2 and 200),
  level smallint not null check (level between 1 and 5),
  faculty text not null check (char_length(faculty) between 2 and 120),
  student_number text check (student_number is null or char_length(student_number) <= 40),
  email text check (email is null or char_length(email) <= 200),
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  notes text check (notes is null or char_length(notes) <= 1000),
  student_id uuid,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists family_members_year_nid on public.family_members (academic_year, national_id);
create index if not exists family_members_year_idx on public.family_members (academic_year, created_at);

alter table public.family_members enable row level security;
revoke all on public.family_members from anon;
grant select, update on public.family_members to authenticated;

create policy family_members_read on public.family_members for select to authenticated
  using ((select private.can_read('applications')));
create policy family_members_write on public.family_members for update to authenticated
  using ((select private.can('applications'))) with check ((select private.can('applications')));

create or replace function private.family_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger family_members_touch before update on public.family_members
  for each row execute function private.family_touch();

-- The academic year that is running in Cairo now (it starts in September).
create or replace function private.current_academic_year() returns text
language sql stable set search_path = ''
as $$
  select case when extract(month from d) >= 9
              then extract(year from d)::int || '/' || (extract(year from d)::int + 1)
              else (extract(year from d)::int - 1) || '/' || extract(year from d)::int end
    from (select (now() at time zone 'Africa/Cairo')::date as d) x
$$;

-- An Egyptian national ID: century digit (2 = 1900s, 3 = 2000s), birth date, governorate code.
create or replace function private.national_id_ok(p text) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_birth date;
begin
  if p !~ '^[23][0-9]{13}$' then
    return false;
  end if;
  begin
    v_birth := make_date((case when left(p, 1) = '2' then 1900 else 2000 end) + substr(p, 2, 2)::int,
                         substr(p, 4, 2)::int, substr(p, 6, 2)::int);
  exception when others then
    return false;
  end;
  if v_birth > current_date - interval '14 years' or v_birth < current_date - interval '70 years' then
    return false;
  end if;
  return substr(p, 8, 2) in ('01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19',
                             '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '34', '35', '88');
end $$;

create or replace function public.submit_family(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_settings jsonb := coalesce((select value from public.site_settings where key = 'family'), '{}'::jsonb);
  v_year text := coalesce(nullif(v_settings ->> 'year', ''), private.current_academic_year());
  v_nid text := regexp_replace(translate(coalesce(p ->> 'national_id', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g');
  v_phone text := regexp_replace(translate(coalesce(p ->> 'phone', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g');
  v_name text := btrim(regexp_replace(coalesce(p ->> 'full_name', ''), '\s+', ' ', 'g'));
  v_level int;
  v_ref text;
  v_recent int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('family', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce((v_settings ->> 'open')::boolean, true) is false then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'family'));
    return jsonb_build_object('ok', true, 'ref', 'FM-000000');
  end if;

  if v_phone ~ '^(20|0020)1[0125][0-9]{8}$' then
    v_phone := '0' || right(v_phone, 10);
  end if;
  begin
    v_level := (p ->> 'level')::int;
  exception when others then
    v_level := null;
  end;
  if array_length(regexp_split_to_array(v_name, ' '), 1) < 3 or char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'full_name');
  end if;
  if not private.national_id_ok(v_nid) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'national_id');
  end if;
  if v_phone !~ '^01[0125][0-9]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'phone');
  end if;
  if v_level is null or v_level not between 1 and 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'level');
  end if;
  if char_length(btrim(coalesce(p ->> 'governorate', ''))) not between 2 and 40
     or char_length(btrim(coalesce(p ->> 'address', ''))) not between 2 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'address');
  end if;
  if char_length(btrim(coalesce(p ->> 'faculty', ''))) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'faculty');
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'consent');
  end if;

  -- Flood guard for the whole form.
  select count(*) into v_recent from public.family_members where created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    perform private.log_security('family_flood', 3, jsonb_build_object('last_minute', v_recent));
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  select ref into v_ref from public.family_members where academic_year = v_year and national_id = v_nid;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true, 'year', v_year);
  end if;

  for i in 1..5 loop
    v_ref := 'FM-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.family_members where ref = v_ref);
  end loop;

  insert into public.family_members (ref, academic_year, full_name, national_id, phone, governorate, address, level,
                                     faculty, student_number, email, locale)
  values (v_ref, v_year, v_name, v_nid, v_phone,
          btrim(p ->> 'governorate'), btrim(p ->> 'address'), v_level, btrim(p ->> 'faculty'),
          nullif(left(btrim(coalesce(p ->> 'student_number', '')), 40), ''),
          nullif(left(lower(btrim(coalesce(p ->> 'email', ''))), 200), ''),
          case when p ->> 'locale' = 'en' then 'en' else 'ar' end);

  perform private.notify_staff('applications', 'تسجيل جديد في الأسرة 👪', v_name || ' · Level ' || v_level,
                               '/app/#/staff/family');
  return jsonb_build_object('ok', true, 'ref', v_ref, 'year', v_year);
exception when unique_violation then
  return jsonb_build_object('ok', true, 'duplicate', true, 'year', v_year,
                            'ref', (select ref from public.family_members where academic_year = v_year and national_id = v_nid));
end $$;
revoke all on function public.submit_family(jsonb) from public;
grant execute on function public.submit_family(jsonb) to anon, authenticated;

create or replace function public.staff_family_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if not private.can('applications') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p ->> 'year', '') !~ '^[0-9]{4}/[0-9]{4}$' then
    raise exception 'invalid_year' using errcode = '22023';
  end if;
  v := jsonb_build_object(
    'open', coalesce((p ->> 'open')::boolean, true),
    'year', p ->> 'year',
    'family', left(btrim(coalesce(p ->> 'family', 'BuildX')), 60),
    'faculty', left(btrim(coalesce(p ->> 'faculty', '')), 120));
  insert into public.site_settings (key, value) values ('family', v)
  on conflict (key) do update set value = excluded.value;
  return v;
end $$;
revoke all on function public.staff_family_settings(jsonb) from public, anon;
grant execute on function public.staff_family_settings(jsonb) to authenticated;
