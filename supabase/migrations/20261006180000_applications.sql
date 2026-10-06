-- BuildX HUE — student applications from the public website.
-- Visitors never touch the table: they call public.submit_application(), which validates,
-- de-duplicates and inserts. Staff read and review applications through RLS.

create type public.application_status as enum ('new', 'contacted', 'interview', 'accepted', 'waitlist', 'rejected');

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  full_name text not null check (char_length(full_name) between 3 and 120),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  faculty text not null check (char_length(faculty) between 2 and 120),
  academic_year text not null check (char_length(academic_year) between 1 and 40),
  student_number text check (char_length(student_number) <= 40),
  track_first text not null check (char_length(track_first) between 1 and 60),
  track_second text check (char_length(track_second) <= 60),
  team_roles text[] not null default '{}' check (cardinality(team_roles) <= 6),
  experience_level text not null check (experience_level in ('beginner', 'some', 'experienced')),
  skills text check (char_length(skills) <= 500),
  experience text check (char_length(experience) <= 2000),
  portfolio_url text check (char_length(portfolio_url) <= 300),
  motivation text not null check (char_length(motivation) between 20 and 2000),
  goals text check (char_length(goals) <= 1000),
  hours_per_week text not null check (hours_per_week in ('lt3', '3to5', '5to10', '10plus')),
  days text[] not null default '{}' check (cardinality(days) <= 7),
  heard_from text check (char_length(heard_from) <= 60),
  consent boolean not null check (consent),
  status public.application_status not null default 'new',
  staff_notes text not null default '' check (char_length(staff_notes) <= 4000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);
create index applications_created_idx on public.applications (created_at desc);
create index applications_status_idx on public.applications (status, created_at desc);
create index applications_phone_idx on public.applications (phone);
create index applications_email_idx on public.applications (lower(email));
create index applications_reviewed_by_idx on public.applications (reviewed_by);

-- Who reviewed what, and when: stamped on every staff edit.
create or replace function private.applications_review() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status or new.staff_notes is distinct from old.staff_notes then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;

create trigger applications_review before update on public.applications
  for each row execute function private.applications_review();
create trigger applications_audit after delete on public.applications
  for each row execute function private.audit();

alter table public.applications enable row level security;
create policy applications_select on public.applications for select to authenticated using ((select private.is_staff()));
create policy applications_update on public.applications for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy applications_delete on public.applications for delete to authenticated using ((select private.is_admin()));

revoke all on public.applications from anon;
revoke insert, truncate on public.applications from authenticated;

-- ─────────────────────────────────────────────────────────────── public entry point
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

revoke execute on function private.applications_review() from public, anon, authenticated;
revoke execute on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
