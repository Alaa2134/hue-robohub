-- BuildX HUE — the website's own forms, all through Supabase (the live site is static):
--   1. Inbox: "Contact us" messages and sponsorship requests, answered from the BuildX App.
--   2. Waitlist: "tell me when applications open" while the intake is closed.
--   3. Form builder: any form the team makes in the app (team tryouts, renewals, volunteers,
--      surveys…), opened and closed by hand or on a schedule, with a response cap.
-- New tables and functions only: nothing existing is changed or dropped.

-- ─────────────────────────────────────────────────────────────── 1. inbox
create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'contact' check (kind in ('contact', 'sponsor')),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  name text not null check (char_length(name) between 2 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,16}$'),
  organization text check (char_length(organization) <= 160),
  topic text not null default 'general' check (topic in ('general', 'partnership', 'media', 'workshop', 'other', 'sponsor')),
  message text not null check (char_length(message) between 10 and 5000),
  extra jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  note text check (char_length(note) <= 2000),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index inbox_messages_created_idx on public.inbox_messages (created_at desc);
create index inbox_messages_status_idx on public.inbox_messages (status, kind);

alter table public.inbox_messages enable row level security;
create policy inbox_staff_select on public.inbox_messages for select to authenticated using ((select private.is_staff()));
create policy inbox_staff_update on public.inbox_messages for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy inbox_admin_delete on public.inbox_messages for delete to authenticated using ((select private.is_admin()));
grant select, update, delete on public.inbox_messages to authenticated;
revoke all on public.inbox_messages from anon;

/** Egyptian mobiles in international form; anything else digits only (null when empty). */
create or replace function private.clean_phone(p text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if v ~ '^01[0-9]{9}$' then return '+2' || v; end if;
  if v ~ '^00[0-9]+$' then return '+' || substr(v, 3); end if;
  return v;
end $$;
revoke execute on function private.clean_phone(text) from public, anon, authenticated;

/** A message from the website ("Contact us" or a sponsorship request). */
create or replace function public.submit_message(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := case when p ->> 'kind' = 'sponsor' then 'sponsor' else 'contact' end;
  v_extra jsonb := '{}';
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('message', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'message'));
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.inbox_messages where created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if v_kind = 'sponsor' then
    v_extra := jsonb_strip_nulls(jsonb_build_object(
      'tier', nullif(left(btrim(p ->> 'tier'), 40), ''),
      'website', nullif(left(btrim(p ->> 'site'), 300), ''),
      'interest', nullif(left(btrim(p ->> 'interest'), 200), '')
    ));
  end if;
  begin
    insert into public.inbox_messages (kind, locale, name, email, phone, organization, topic, message, extra)
    values (
      v_kind,
      case when p ->> 'locale' = 'en' then 'en' else 'ar' end,
      btrim(p ->> 'name'),
      nullif(lower(btrim(p ->> 'email')), ''),
      private.clean_phone(p ->> 'phone'),
      nullif(btrim(p ->> 'organization'), ''),
      case when v_kind = 'sponsor' then 'sponsor' else coalesce(nullif(p ->> 'topic', ''), 'general') end,
      btrim(p ->> 'message'),
      v_extra
    );
  exception
    when check_violation or not_null_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.submit_message(jsonb) from public;
grant execute on function public.submit_message(jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 2. waitlist
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'applications' check (kind in ('applications')),
  name text check (char_length(name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,16}$'),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
-- One waiting entry per person (after they're told, they can sign up again for the next intake).
create unique index waitlist_phone_uq on public.waitlist (kind, phone) where phone is not null and notified_at is null;
create unique index waitlist_email_uq on public.waitlist (kind, email) where email is not null and notified_at is null;
create index waitlist_created_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;
create policy waitlist_staff_select on public.waitlist for select to authenticated using ((select private.is_staff()));
create policy waitlist_staff_update on public.waitlist for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy waitlist_admin_delete on public.waitlist for delete to authenticated using ((select private.is_admin()));
grant select, update, delete on public.waitlist to authenticated;
revoke all on public.waitlist from anon;

/** "Tell me when applications open": one entry per phone / email. */
create or replace function public.join_waitlist(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := private.clean_phone(p ->> 'phone');
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.throttle('waitlist', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if exists (select 1 from public.waitlist where kind = 'applications' and notified_at is null and (phone = v_phone or email = v_email)) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  begin
    insert into public.waitlist (name, phone, email, locale)
    values (nullif(btrim(p ->> 'name'), ''), v_phone, v_email, case when p ->> 'locale' = 'en' then 'en' else 'ar' end)
    on conflict do nothing;
  exception
    when check_violation or not_null_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.join_waitlist(jsonb) from public;
grant execute on function public.join_waitlist(jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 3. form builder
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  title_ar text not null check (char_length(title_ar) between 2 and 160),
  title_en text check (char_length(title_en) <= 160),
  intro_ar text check (char_length(intro_ar) <= 2000),
  intro_en text check (char_length(intro_en) <= 2000),
  success_ar text check (char_length(success_ar) <= 600),
  success_en text check (char_length(success_en) <= 600),
  -- [{id, type, label_ar, label_en, required, options: [{ar, en}], help_ar, help_en}]
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  -- Competition team this form recruits for (its page shows "Apply to the team").
  team text check (team is null or team ~ '^[a-z0-9-]{2,40}$'),
  open boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  max_responses int check (max_responses between 1 and 100000),
  listed boolean not null default true,
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forms_team_idx on public.forms (team) where team is not null;

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  name text,
  phone text,
  email text,
  locale text not null default 'ar',
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected', 'waiting')),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index form_responses_form_idx on public.form_responses (form_id, created_at desc);

create or replace function private.forms_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger forms_touch before insert or update on public.forms for each row execute function private.forms_touch();
revoke execute on function private.forms_touch() from public, anon, authenticated;

/** Is the form taking answers right now? */
create or replace function private.form_is_open(f public.forms) returns boolean
language sql stable security definer set search_path = ''
as $$
  select f.open and not f.archived
     and (f.opens_at is null or f.opens_at <= now())
     and (f.closes_at is null or f.closes_at > now())
     and (f.max_responses is null or (select count(*) from public.form_responses r where r.form_id = f.id) < f.max_responses)
$$;
revoke execute on function private.form_is_open(public.forms) from public, anon, authenticated;

alter table public.forms enable row level security;
alter table public.form_responses enable row level security;
create policy forms_staff_all on public.forms for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy responses_staff_select on public.form_responses for select to authenticated using ((select private.is_staff()));
create policy responses_staff_update on public.form_responses for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy responses_admin_delete on public.form_responses for delete to authenticated using ((select private.is_admin()));
grant select, insert, update, delete on public.forms to authenticated;
grant select, update, delete on public.form_responses to authenticated;
revoke all on public.forms, public.form_responses from anon;

/** The forms the website shows: open now, or (for a team page) its latest form either way. */
create or replace function public.public_forms() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', f.slug, 'title_ar', f.title_ar, 'title_en', f.title_en, 'intro_ar', f.intro_ar, 'intro_en', f.intro_en,
    'team', f.team, 'listed', f.listed, 'open', private.form_is_open(f), 'opens_at', f.opens_at, 'closes_at', f.closes_at
  ) order by f.created_at desc), '[]')
  from public.forms f
  where not f.archived and (f.open or (f.opens_at is not null and f.opens_at > now()))
$$;

/** One form to fill in (fields included). */
create or replace function public.public_form(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', f.slug, 'title_ar', f.title_ar, 'title_en', f.title_en, 'intro_ar', f.intro_ar, 'intro_en', f.intro_en,
    'success_ar', f.success_ar, 'success_en', f.success_en, 'fields', f.fields, 'team', f.team,
    'open', private.form_is_open(f), 'opens_at', f.opens_at, 'closes_at', f.closes_at
  )
  from public.forms f where f.slug = lower(btrim(p_slug)) and not f.archived
$$;

/** Answers to a form, checked against its fields on the server. */
create or replace function public.submit_form(p_slug text, p_answers jsonb, p_locale text default 'ar', p_website text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  v_errors jsonb := '{}';
begin
  if not private.throttle('form', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p_website, '') <> '' then
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
        -- Only options the form offers.
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
    v_text := case when v_type = 'checkbox' then (case when v_val = 'true'::jsonb then 'نعم' else null end) else nullif(btrim(v_val #>> '{}'), '') end;
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
  -- The same person sending twice gets the first answer back.
  if (v_phone is not null or v_email is not null) and exists (
    select 1 from public.form_responses where form_id = f.id and (phone = v_phone or email = v_email)
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.form_responses (form_id, answers, name, phone, email, locale)
  values (f.id, v_clean, v_name, v_phone, v_email, case when p_locale = 'en' then 'en' else 'ar' end);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.public_forms(), public.public_form(text), public.submit_form(text, jsonb, text, text) from public;
grant execute on function public.public_forms(), public.public_form(text), public.submit_form(text, jsonb, text, text) to anon, authenticated;
