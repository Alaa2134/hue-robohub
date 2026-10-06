-- BuildX HUE — applications, round 2: open/close the intake from the app, and turn an accepted
-- applicant into a BuildX App student in one step.

-- Public site settings (read by the website, edited by owners/admins).
create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function private.site_settings_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger site_settings_touch before insert or update on public.site_settings
  for each row execute function private.site_settings_touch();

alter table public.site_settings enable row level security;
create policy site_settings_public on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_insert on public.site_settings for insert to authenticated with check ((select private.is_admin()));
create policy site_settings_update on public.site_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select on public.site_settings to anon;
revoke insert, update, delete, truncate on public.site_settings from anon;
revoke delete, truncate on public.site_settings from authenticated;
revoke execute on function private.site_settings_touch() from public, anon, authenticated;

insert into public.site_settings (key, value)
values ('applications', '{"open": true, "message_ar": "", "message_en": ""}')
on conflict (key) do nothing;

-- Link an application to the student account created from it.
alter table public.applications add column student_id uuid references public.students (id) on delete set null;
create index applications_student_idx on public.applications (student_id);

create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_ref text;
  v_recent int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Applications can be closed from the app between intakes.
  if coalesce((select (value ->> 'open')::boolean from public.site_settings where key = 'applications'), true) is false then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  -- Honeypot field: bots fill it, people never see it.
  if coalesce(p ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true, 'ref', 'BX-000000');
  end if;
  -- Egyptian mobile numbers are stored in international form.
  if v_phone ~ '^01[0-9]{9}$' then
    v_phone := '+2' || v_phone;
  elsif v_phone ~ '^00[0-9]+$' then
    v_phone := '+' || substr(v_phone, 3);
  end if;

  -- Flood guard for the whole form.
  select count(*) into v_recent from public.applications where created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  -- One application per person a week: a resubmission returns the earlier reference.
  select ref into v_ref from public.applications
   where (phone = v_phone or lower(email) = v_email) and created_at > now() - interval '7 days'
   order by created_at desc limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true);
  end if;

  for i in 1..5 loop
    v_ref := 'BX-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.applications where ref = v_ref);
  end loop;

  insert into public.applications (
    ref, locale, full_name, phone, email, faculty, academic_year, student_number,
    track_first, track_second, team_roles, experience_level, skills, experience, portfolio_url,
    motivation, goals, hours_per_week, days, heard_from, consent
  ) values (
    v_ref,
    case when p ->> 'locale' = 'en' then 'en' else 'ar' end,
    btrim(p ->> 'full_name'),
    v_phone,
    v_email,
    btrim(p ->> 'faculty'),
    btrim(p ->> 'academic_year'),
    nullif(btrim(p ->> 'student_number'), ''),
    btrim(p ->> 'track_first'),
    nullif(btrim(p ->> 'track_second'), ''),
    coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'team_roles', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    p ->> 'experience_level',
    nullif(btrim(p ->> 'skills'), ''),
    nullif(btrim(p ->> 'experience'), ''),
    nullif(btrim(p ->> 'portfolio_url'), ''),
    btrim(p ->> 'motivation'),
    nullif(btrim(p ->> 'goals'), ''),
    p ->> 'hours_per_week',
    coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'days', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    nullif(btrim(p ->> 'heard_from'), ''),
    coalesce((p ->> 'consent')::boolean, false)
  );
  return jsonb_build_object('ok', true, 'ref', v_ref);
exception
  when check_violation or not_null_violation or invalid_text_representation or invalid_parameter_value or string_data_right_truncation then
    return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

-- Accept an application: create the student (same rules as adding one by hand) and mark it accepted.
-- Runs with the caller's rights, so only staff (through RLS) can use it.
create or replace function public.accept_application(p_id uuid, p_code text, p_group text default '') returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  a public.applications%rowtype;
  v_id uuid;
begin
  select * into a from public.applications where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.student_id is not null then
    return a.student_id;
  end if;
  insert into public.students (code, code_key, full_name, group_name, phone, notes)
  values (p_code, coalesce(private.code_key(p_code), ''), a.full_name, coalesce(p_group, ''), a.phone, 'من طلب الانضمام ' || a.ref)
  returning id into v_id;
  update public.applications set status = 'accepted', student_id = v_id where id = p_id;
  return v_id;
end $$;

revoke execute on function public.accept_application(uuid, text, text) from public, anon;
grant execute on function public.accept_application(uuid, text, text) to authenticated;
