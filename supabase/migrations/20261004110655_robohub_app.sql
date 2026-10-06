-- ═══════════════════════════════════════════════════════════════════════════
-- RoboHub App backend (Supabase): staff, students, attendance, materials, quizzes.
-- Applied to the hosted project as migrations robohub_app_1_tables … robohub_app_8_invoker_rpcs;
-- this file is their consolidated end state.
--
-- Security model
-- * Staff are Supabase Auth users with an active row in public.staff (owner / admin / lead).
--   Every table has RLS; the anon role has no table privileges at all.
-- * Students are not Auth users. They sign in with their ID code + PIN through
--   SECURITY DEFINER RPCs and receive an opaque session token (only its SHA-256 is stored).
-- * PIN hashes (bcrypt), student sessions and the one-time setup secret live in the
--   "private" schema, which the Data API does not expose.
-- * Quizzes are graded in SQL. Correct answers never reach a student before review.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────── types
create type public.staff_role as enum ('owner', 'admin', 'lead');
create type public.attendance_status as enum ('present', 'late', 'excused', 'absent');

-- ─────────────────────────────────────────────────────────────── pure helpers
-- Student code key: Arabic/Persian digits → ASCII, upper case, letters and digits only.
create or replace function private.code_key(p text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select nullif(regexp_replace(upper(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')), '[^0-9A-Z]', '', 'g'), '')
$$;

-- Short-answer normalisation: case, Arabic letter variants, tashkeel, digits, outer punctuation, spaces.
create or replace function private.norm_answer(p text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
    translate(lower(coalesce(p, '')), 'أإآٱىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـ', 'اااايه01234567890123456789'),
    '[ً-ْٰ]', '', 'g'),
    '^[[:punct:][:space:]،؛؟]+|[[:punct:][:space:]،؛؟]+$', '', 'g'),
    '[[:space:]]+', ' ', 'g'))
$$;

create or replace function private.random_pin() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v text;
begin
  loop
    v := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when v !~ '^(\d)\1{5}$' and v not in ('123456', '654321', '012345', '543210', '987654', '456789', '123123');
  end loop;
  return v;
end $$;

create or replace function private.touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────── tables
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role public.staff_role not null default 'lead',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) between 1 and 40),
  code_key text not null,
  barcode text check (barcode is null or char_length(barcode) <= 80),
  barcode_key text,
  full_name text not null check (char_length(full_name) between 1 and 120),
  group_name text not null default '' check (char_length(group_name) <= 60),
  phone text check (phone is null or char_length(phone) <= 30),
  notes text check (notes is null or char_length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index students_code_key_idx on public.students (code_key);
create unique index students_barcode_key_idx on public.students (barcode_key) where barcode_key is not null;
create index students_digits_idx on public.students ((regexp_replace(code_key, '\D', '', 'g')));
create index students_group_idx on public.students (group_name);

create table private.student_secrets (
  student_id uuid primary key references public.students (id) on delete cascade,
  pin_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  pin_changed_at timestamptz,
  last_login_at timestamptz
);

create table private.student_sessions (
  token_hash bytea primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index student_sessions_student_idx on private.student_sessions (student_id);

create table private.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  group_name text not null default '' check (char_length(group_name) <= 60),
  starts_at timestamptz not null default now(),
  late_after_min int not null default 15 check (late_after_min between 0 and 600),
  closed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index attendance_sessions_starts_idx on public.attendance_sessions (starts_at desc);

create table public.attendance (
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status public.attendance_status not null default 'present',
  method text not null default 'manual' check (method in ('scan', 'manual')),
  marked_at timestamptz not null default now(),
  marked_by uuid default auth.uid(),
  primary key (session_id, student_id)
);
create index attendance_student_idx on public.attendance (student_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  kind text not null default 'file' check (kind in ('file', 'link')),
  storage_path text check (storage_path is null or storage_path ~ '^m/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  url text check (url is null or (url ~* '^https://' and char_length(url) <= 1000)),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  mime text check (mime is null or char_length(mime) <= 120),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  group_name text not null default '' check (char_length(group_name) <= 60),
  published boolean not null default true,
  pinned boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint materials_payload check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);
create index materials_created_idx on public.materials (created_at desc);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  group_name text not null default '' check (char_length(group_name) <= 60),
  published boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  time_limit_min int check (time_limit_min is null or time_limit_min between 1 and 600),
  max_attempts int not null default 1 check (max_attempts between 1 and 20),
  shuffle boolean not null default true,
  show_answers boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quizzes_window check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position int not null default 0,
  kind text not null default 'single' check (kind in ('single', 'multi', 'truefalse', 'short')),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  image_path text check (image_path is null or image_path ~ '^q/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 12),
  correct jsonb not null default '[]' check (jsonb_typeof(correct) = 'array' and jsonb_array_length(correct) <= 12),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  points numeric(6, 2) not null default 1 check (points >= 0 and points <= 1000)
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  started_at timestamptz not null default now(),
  deadline timestamptz,
  submitted_at timestamptz,
  late boolean not null default false,
  question_ids uuid[] not null default '{}',
  answers jsonb not null default '{}',
  results jsonb not null default '{}',
  score numeric(8, 2),
  max_score numeric(8, 2)
);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, quiz_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ─────────────────────────────────────────────────────────────── role helpers (used by RLS)
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active and role in ('owner', 'admin'))
$$;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active and role = 'owner')
$$;

create or replace function private.student_brief(s public.students) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'code', s.code, 'name', s.full_name, 'group', s.group_name, 'active', s.active)
$$;

-- ─────────────────────────────────────────────────────────────── triggers
create or replace function private.students_normalize() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.code := btrim(regexp_replace(new.code, '\s+', ' ', 'g'));
  new.code_key := private.code_key(new.code);
  if new.code_key is null then
    raise exception 'invalid_code' using errcode = '22023', detail = 'A student code needs at least one letter or digit.';
  end if;
  new.barcode := nullif(btrim(coalesce(new.barcode, '')), '');
  new.barcode_key := private.code_key(new.barcode);
  if new.barcode_key = new.code_key then
    new.barcode := null;
    new.barcode_key := null;
  end if;
  if new.barcode_key is not null and exists (select 1 from public.students where code_key = new.barcode_key and id <> new.id) then
    raise exception 'barcode_taken' using errcode = '23505';
  end if;
  if exists (select 1 from public.students where barcode_key = new.code_key and id <> new.id) then
    raise exception 'code_taken' using errcode = '23505';
  end if;
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.group_name := btrim(regexp_replace(coalesce(new.group_name, ''), '\s+', ' ', 'g'));
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger students_normalize before insert or update on public.students
  for each row execute function private.students_normalize();

-- Staff may rename themselves; only the owner changes roles or access. The last owner stays.
create or replace function private.staff_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_owner() then
    if new.role <> old.role or new.active <> old.active or new.email <> old.email or new.user_id <> old.user_id then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active)
     and not exists (select 1 from public.staff where role = 'owner' and active and user_id <> old.user_id) then
    raise exception 'last_owner' using errcode = '23514', detail = 'Make another person owner first.';
  end if;
  new.email := lower(new.email);
  new.updated_at := now();
  return new;
end $$;
create trigger staff_guard before update on public.staff
  for each row execute function private.staff_guard();

create trigger quizzes_touch before update on public.quizzes
  for each row execute function private.touch();

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'name', coalesce(v_row ->> 'full_name', v_row ->> 'title'),
      'code', v_row ->> 'code',
      'role', v_row ->> 'role',
      'active', v_row -> 'active',
      'published', v_row -> 'published'))
  );
  return null;
end $$;

create trigger students_audit after delete on public.students
  for each row execute function private.audit();
create trigger staff_audit after update on public.staff
  for each row execute function private.audit();
create trigger sessions_audit after delete on public.attendance_sessions
  for each row execute function private.audit();
create trigger materials_audit after insert or delete on public.materials
  for each row execute function private.audit();
create trigger quizzes_audit after insert or delete on public.quizzes
  for each row execute function private.audit();

-- ─────────────────────────────────────────────────────────────── row level security
alter table public.staff enable row level security;
alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.materials enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.audit_log enable row level security;

create policy staff_select on public.staff for select to authenticated
  using ((select private.is_staff()));
create policy staff_update on public.staff for update to authenticated
  using ((select private.is_owner()) or user_id = (select auth.uid()))
  with check ((select private.is_owner()) or user_id = (select auth.uid()));
create policy staff_delete on public.staff for delete to authenticated
  using ((select private.is_owner()) and user_id <> (select auth.uid()));

create policy students_select on public.students for select to authenticated using ((select private.is_staff()));
create policy students_insert on public.students for insert to authenticated with check ((select private.is_staff()));
create policy students_update on public.students for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy students_delete on public.students for delete to authenticated using ((select private.is_admin()));

create policy sessions_select on public.attendance_sessions for select to authenticated using ((select private.is_staff()));
create policy sessions_insert on public.attendance_sessions for insert to authenticated with check ((select private.is_staff()));
create policy sessions_update on public.attendance_sessions for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy sessions_delete on public.attendance_sessions for delete to authenticated
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.is_staff())));

create policy attendance_select on public.attendance for select to authenticated using ((select private.is_staff()));
create policy attendance_insert on public.attendance for insert to authenticated with check ((select private.is_staff()));
create policy attendance_update on public.attendance for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy attendance_delete on public.attendance for delete to authenticated using ((select private.is_staff()));

create policy materials_select on public.materials for select to authenticated using ((select private.is_staff()));
create policy materials_insert on public.materials for insert to authenticated with check ((select private.is_staff()));
create policy materials_update on public.materials for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy materials_delete on public.materials for delete to authenticated
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.is_staff())));

create policy quizzes_select on public.quizzes for select to authenticated using ((select private.is_staff()));
create policy quizzes_insert on public.quizzes for insert to authenticated with check ((select private.is_staff()));
create policy quizzes_update on public.quizzes for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy quizzes_delete on public.quizzes for delete to authenticated
  using ((select private.is_admin()) or (created_by = (select auth.uid()) and (select private.is_staff())));

create policy questions_select on public.quiz_questions for select to authenticated using ((select private.is_staff()));
create policy questions_insert on public.quiz_questions for insert to authenticated with check ((select private.is_staff()));
create policy questions_update on public.quiz_questions for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy questions_delete on public.quiz_questions for delete to authenticated using ((select private.is_staff()));

create policy attempts_select on public.quiz_attempts for select to authenticated using ((select private.is_staff()));
create policy attempts_delete on public.quiz_attempts for delete to authenticated using ((select private.is_staff()));

create policy audit_select on public.audit_log for select to authenticated using ((select private.is_admin()));

-- Students reach data only through the RPCs below: no table privileges for anon at all.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke insert, update, truncate on public.quiz_attempts from authenticated;
revoke insert, truncate on public.staff from authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── storage: materials bucket
-- Public bucket with unguessable paths (m/<uuid>/<file>, q/<uuid>.<ext>); listing and writes are staff-only.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', true, 52428800)
on conflict (id) do nothing;

create policy materials_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (select private.is_staff()));
create policy materials_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (select private.is_staff()));
create policy materials_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'materials' and (select private.is_staff()));
create policy materials_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (select private.is_staff()));

-- ─────────────────────────────────────────────────────────────── student sessions
create or replace function private.session_student(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash bytea;
  v_id uuid;
  v_seen timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'session_invalid' using errcode = 'P0001';
  end if;
  v_hash := extensions.digest(p_token, 'sha256');
  select s.student_id, s.last_seen_at into v_id, v_seen
    from private.student_sessions s
    join public.students st on st.id = s.student_id and st.active
   where s.token_hash = v_hash and s.revoked_at is null and s.expires_at > now();
  if v_id is null then
    raise exception 'session_invalid' using errcode = 'P0001';
  end if;
  if v_seen < now() - interval '6 hours' then
    update private.student_sessions set last_seen_at = now(), expires_at = now() + interval '120 days' where token_hash = v_hash;
  end if;
  return v_id;
end $$;

-- Wrong PINs lock the code for 15 min after 5 tries, doubling every further 5 (max 16 h).
create or replace function public.student_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := private.code_key(p_code);
  v_st public.students%rowtype;
  v_sec private.student_secrets%rowtype;
  v_fails int;
  v_token text;
begin
  if v_key is null or p_pin is null or p_pin !~ '^[0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_st from public.students where code_key = v_key and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_sec from private.student_secrets where student_id = v_st.id for update;
  if not found or v_sec.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;
  if v_sec.locked_until is not null and v_sec.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'until', v_sec.locked_until);
  end if;
  if extensions.crypt(p_pin, v_sec.pin_hash) <> v_sec.pin_hash then
    v_fails := v_sec.failed_attempts + 1;
    update private.student_secrets
       set failed_attempts = v_fails,
           locked_until = case when v_fails % 5 = 0
             then now() + make_interval(mins => 15 * (2 ^ least(v_fails / 5 - 1, 6))::int)
             else locked_until end
     where student_id = v_st.id;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update private.student_secrets set failed_attempts = 0, locked_until = null, last_login_at = now() where student_id = v_st.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.student_sessions (token_hash, student_id, expires_at)
  values (extensions.digest(v_token, 'sha256'), v_st.id, now() + interval '120 days');
  -- Keep the five newest sessions per student; older ones are revoked.
  update private.student_sessions set revoked_at = now()
   where student_id = v_st.id and revoked_at is null
     and token_hash not in (select token_hash from private.student_sessions
                             where student_id = v_st.id and revoked_at is null order by created_at desc limit 5);
  return jsonb_build_object('ok', true, 'token', v_token,
    'student', jsonb_build_object('name', v_st.full_name, 'code', v_st.code, 'group', v_st.group_name));
end $$;

create or replace function public.student_logout(p_token text) returns void
language sql security definer set search_path = ''
as $$
  update private.student_sessions set revoked_at = now()
   where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and revoked_at is null
$$;

create or replace function public.student_change_pin(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_hash text;
begin
  if p_new is null or p_new !~ '^[0-9]{6}$' or p_new ~ '^(\d)\1{5}$'
     or p_new in ('123456', '654321', '012345', '543210', '987654', '456789', '123123') then
    return jsonb_build_object('ok', false, 'error', 'weak');
  end if;
  select pin_hash into v_hash from private.student_secrets where student_id = v_id for update;
  if v_hash is null or p_old is null or extensions.crypt(p_old, v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update private.student_secrets
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8)), pin_changed_at = now(), failed_attempts = 0
   where student_id = v_id;
  -- Sign out every other device.
  update private.student_sessions set revoked_at = now()
   where student_id = v_id and revoked_at is null and token_hash <> extensions.digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────── student portal data
create or replace function public.student_home(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_st public.students%rowtype;
begin
  select * into v_st from public.students where id = v_id;
  return jsonb_build_object(
    'now', now(),
    'student', jsonb_build_object('name', v_st.full_name, 'code', v_st.code, 'group', v_st.group_name),
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'title', m.title, 'description', m.description, 'kind', m.kind,
          'path', m.storage_path, 'url', m.url, 'fileName', m.file_name, 'mime', m.mime,
          'size', m.size_bytes, 'pinned', m.pinned, 'at', m.created_at)
        order by m.pinned desc, m.created_at desc)
        from public.materials m
       where m.published and (m.group_name = '' or m.group_name = v_st.group_name)), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', q.id, 'title', q.title, 'description', q.description,
          'opensAt', q.opens_at, 'closesAt', q.closes_at, 'timeLimit', q.time_limit_min,
          'maxAttempts', q.max_attempts, 'questions', qs.n, 'maxScore', qs.pts,
          'used', qa.used, 'best', qa.best, 'inProgress', qa.open_id,
          'state', case
            when q.opens_at is not null and q.opens_at > now() then 'upcoming'
            when qa.used >= q.max_attempts then 'done'
            when q.closes_at is not null and q.closes_at <= now() then 'closed'
            else 'open' end)
        order by coalesce(q.opens_at, q.created_at) desc)
        from public.quizzes q
        cross join lateral (
          select count(*) as n, coalesce(sum(points), 0) as pts
            from public.quiz_questions where quiz_id = q.id) qs
        cross join lateral (
          select count(*) filter (where submitted_at is not null) as used,
                 max(score) filter (where submitted_at is not null) as best,
                 (array_agg(id order by started_at desc) filter (where submitted_at is null))[1] as open_id
            from public.quiz_attempts where quiz_id = q.id and student_id = v_id) qa
       where q.published and (q.group_name = '' or q.group_name = v_st.group_name)), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'at', s.starts_at,
          'status', coalesce(a.status::text,
            case when s.closed_at is not null or s.starts_at < now() - interval '12 hours' then 'absent' else 'pending' end))
        order by s.starts_at desc)
        from public.attendance_sessions s
        left join public.attendance a on a.session_id = s.id and a.student_id = v_id
       where a.student_id is not null
          or ((s.group_name = '' or s.group_name = v_st.group_name) and s.starts_at >= v_st.created_at - interval '1 day')), '[]'::jsonb)
  );
end $$;

-- ─────────────────────────────────────────────────────────────── quizzes (server-side grading)
create or replace function private.grade_attempt(p_attempt uuid, p_answers jsonb, p_late boolean, p_regrade boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.quiz_attempts%rowtype;
  v_results jsonb := '{}'::jsonb;
  v_score numeric := 0;
  v_max numeric := 0;
  r record;
  v_given jsonb;
  v_ok boolean;
begin
  select * into v_a from public.quiz_attempts where id = p_attempt for update;
  for r in select * from public.quiz_questions where id = any (v_a.question_ids) loop
    v_given := p_answers -> r.id::text;
    v_max := v_max + r.points;
    if r.kind = 'short' then
      v_ok := jsonb_typeof(v_given) = 'string'
        and private.norm_answer(v_given #>> '{}') <> ''
        and exists (select 1 from jsonb_array_elements_text(r.correct) c
                     where private.norm_answer(c) = private.norm_answer(v_given #>> '{}'));
    else
      v_ok := jsonb_typeof(v_given) = 'array'
        and jsonb_array_length(r.correct) > 0
        and (select coalesce(array_agg(distinct x order by x), '{}') from jsonb_array_elements_text(v_given) x)
          = (select coalesce(array_agg(distinct x order by x), '{}') from jsonb_array_elements_text(r.correct) x);
    end if;
    v_ok := coalesce(v_ok, false);
    if v_ok then
      v_score := v_score + r.points;
    end if;
    v_results := v_results || jsonb_build_object(r.id::text, v_ok);
  end loop;
  if p_regrade then
    update public.quiz_attempts set results = v_results, score = v_score, max_score = v_max where id = p_attempt;
  else
    update public.quiz_attempts
       set answers = coalesce(p_answers, '{}'::jsonb), results = v_results, score = v_score, max_score = v_max,
           submitted_at = now(), late = coalesce(p_late, false)
     where id = p_attempt;
  end if;
end $$;

create or replace function private.attempt_result(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.quiz_attempts%rowtype;
  v_q public.quizzes%rowtype;
  v_used int;
  v_review boolean;
begin
  select * into v_a from public.quiz_attempts where id = p_attempt;
  select * into v_q from public.quizzes where id = v_a.quiz_id;
  select count(*) into v_used from public.quiz_attempts
   where quiz_id = v_a.quiz_id and student_id = v_a.student_id and submitted_at is not null;
  -- Answers are revealed only once the student can no longer retake the quiz.
  v_review := v_q.show_answers and (v_used >= v_q.max_attempts or (v_q.closes_at is not null and v_q.closes_at <= now()));
  return jsonb_build_object('ok', true, 'attempt', v_a.id,
    'quiz', jsonb_build_object('id', v_q.id, 'title', v_q.title),
    'score', v_a.score, 'max', v_a.max_score, 'late', v_a.late, 'submittedAt', v_a.submitted_at,
    'attemptsLeft', greatest(v_q.max_attempts - v_used, 0),
    'review', case when v_review then (
      select jsonb_agg(jsonb_build_object(
          'id', qq.id, 'kind', qq.kind, 'prompt', qq.prompt, 'image', qq.image_path, 'points', qq.points,
          'options', qq.options, 'correct', qq.correct, 'explanation', qq.explanation,
          'given', v_a.answers -> qq.id::text,
          'ok', coalesce((v_a.results ->> qq.id::text)::boolean, false))
        order by array_position(v_a.question_ids, qq.id))
        from public.quiz_questions qq where qq.id = any (v_a.question_ids)) end);
end $$;

create or replace function public.student_quiz_start(p_token text, p_quiz uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
  v_q public.quizzes%rowtype;
  v_a public.quiz_attempts%rowtype;
  v_used int;
  v_ids uuid[];
begin
  select group_name into v_group from public.students where id = v_id;
  select * into v_q from public.quizzes
   where id = p_quiz and published and (group_name = '' or group_name = v_group);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_id::text || ':' || p_quiz::text, 0));

  select * into v_a from public.quiz_attempts
   where quiz_id = p_quiz and student_id = v_id and submitted_at is null
   order by started_at desc limit 1;
  if found and v_a.deadline is not null and now() > v_a.deadline + interval '2 minutes' then
    -- Time ran out without a submission: grade whatever was saved and start fresh.
    perform private.grade_attempt(v_a.id, v_a.answers, true);
    v_a := null;
  end if;

  if v_a.id is null then
    if v_q.opens_at is not null and v_q.opens_at > now() then
      return jsonb_build_object('ok', false, 'error', 'not_open');
    end if;
    if v_q.closes_at is not null and v_q.closes_at <= now() then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;
    select count(*) into v_used from public.quiz_attempts
     where quiz_id = p_quiz and student_id = v_id and submitted_at is not null;
    if v_used >= v_q.max_attempts then
      return jsonb_build_object('ok', false, 'error', 'no_attempts');
    end if;
    select array_agg(id order by case when v_q.shuffle then random() else position::float8 end, id) into v_ids
      from public.quiz_questions where quiz_id = p_quiz;
    if v_ids is null then
      return jsonb_build_object('ok', false, 'error', 'empty');
    end if;
    insert into public.quiz_attempts (quiz_id, student_id, deadline, question_ids)
    values (p_quiz, v_id,
      case when v_q.time_limit_min is null then v_q.closes_at
           else least(now() + make_interval(mins => v_q.time_limit_min), coalesce(v_q.closes_at, 'infinity'::timestamptz)) end,
      v_ids)
    returning * into v_a;
  end if;

  return jsonb_build_object('ok', true, 'attempt', v_a.id, 'deadline', v_a.deadline, 'now', now(), 'answers', v_a.answers,
    'quiz', jsonb_build_object('id', v_q.id, 'title', v_q.title, 'description', v_q.description),
    'questions', (
      select jsonb_agg(jsonb_build_object('id', qq.id, 'kind', qq.kind, 'prompt', qq.prompt, 'image', qq.image_path, 'points', qq.points,
          'options', case when qq.kind in ('single', 'multi') then (
              select coalesce(jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text')
                       order by case when v_q.shuffle then random() else ord::float8 end), '[]'::jsonb)
                from jsonb_array_elements(qq.options) with ordinality as x(o, ord))
            else '[]'::jsonb end)
        order by array_position(v_a.question_ids, qq.id))
        from public.quiz_questions qq where qq.id = any (v_a.question_ids)));
end $$;

-- Saves answers while the quiz is in progress (resume after a reload or on another device).
create or replace function public.student_quiz_save(p_token text, p_attempt uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_a public.quiz_attempts%rowtype;
begin
  select * into v_a from public.quiz_attempts where id = p_attempt and student_id = v_id for update;
  if not found or v_a.submitted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 65536 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.quiz_attempts set answers = private.clean_answers(p_answers, v_a.question_ids) where id = p_attempt;
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.clean_answers(p_answers jsonb, p_ids uuid[]) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key,
      case jsonb_typeof(e.value)
        when 'string' then to_jsonb(left(e.value #>> '{}', 500))
        when 'array' then (select coalesce(jsonb_agg(to_jsonb(left(y.x, 40))), '[]'::jsonb)
                             from (select x from jsonb_array_elements_text(e.value) x limit 20) y)
        else 'null'::jsonb end), '{}'::jsonb)
    from jsonb_each(p_answers) e
   where e.key in (select unnest(p_ids)::text)
$$;

create or replace function public.student_quiz_submit(p_token text, p_attempt uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_a public.quiz_attempts%rowtype;
begin
  select * into v_a from public.quiz_attempts where id = p_attempt and student_id = v_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_a.submitted_at is null then
    if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 65536 then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    perform private.grade_attempt(v_a.id, private.clean_answers(p_answers, v_a.question_ids),
      v_a.deadline is not null and now() > v_a.deadline + interval '1 minute');
  end if;
  -- Idempotent: a retried submit returns the stored result.
  return private.attempt_result(v_a.id);
end $$;

create or replace function public.student_quiz_review(p_token text, p_quiz uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_attempt uuid;
begin
  select id into v_attempt from public.quiz_attempts
   where quiz_id = p_quiz and student_id = v_id and submitted_at is not null
   order by score desc nulls last, submitted_at desc limit 1;
  if v_attempt is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return private.attempt_result(v_attempt);
end $$;

-- ─────────────────────────────────────────────────────────────── staff RPCs
create or replace function public.staff_list_students() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id, 'code', s.code, 'codeKey', s.code_key, 'barcode', s.barcode, 'barcodeKey', s.barcode_key,
        'name', s.full_name, 'group', s.group_name, 'phone', s.phone, 'notes', s.notes, 'active', s.active,
        'createdAt', s.created_at, 'hasPin', x.pin_hash is not null,
        'locked', coalesce(x.locked_until > now(), false), 'lastLogin', x.last_login_at)
      order by s.group_name, s.full_name)
      from public.students s
      left join private.student_secrets x on x.student_id = s.id), '[]'::jsonb);
end $$;

-- New PINs for the given students (plain text returned once, only bcrypt hashes are stored).
create or replace function public.staff_set_pins(p_ids uuid[], p_only_missing boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_pin text;
  v_out jsonb := '[]'::jsonb;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 3000 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for r in
    select s.id, s.code, s.full_name, s.group_name
      from public.students s
      left join private.student_secrets x on x.student_id = s.id
     where s.id = any (p_ids) and (not p_only_missing or x.pin_hash is null)
     order by s.group_name, s.full_name
  loop
    v_pin := private.random_pin();
    insert into private.student_secrets as x (student_id, pin_hash, failed_attempts, locked_until, pin_changed_at)
    values (r.id, extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), 0, null, now())
    on conflict (student_id) do update
      set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, pin_changed_at = now();
    update private.student_sessions ss set revoked_at = now() where ss.student_id = r.id and ss.revoked_at is null;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.full_name, 'group', r.group_name, 'pin', v_pin));
  end loop;
  insert into public.audit_log (actor, actor_email, action, entity, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'set_pins', 'students',
          jsonb_build_object('count', jsonb_array_length(v_out), 'onlyMissing', p_only_missing));
  return v_out;
end $$;

-- Scan or type a code: finds the student (ID code, linked barcode, or unique digits match) and marks them.
create or replace function public.attendance_scan(p_session uuid, p_raw text, p_at timestamptz default null, p_method text default 'scan')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_key text := private.code_key(p_raw);
  v_digits text;
  v_n int;
  v_st public.students%rowtype;
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_row public.attendance%rowtype;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_s from public.attendance_sessions where id = p_session;
  if not found then
    return jsonb_build_object('result', 'no_session');
  end if;
  if v_s.closed_at is not null then
    return jsonb_build_object('result', 'closed');
  end if;
  if v_key is null then
    return jsonb_build_object('result', 'unknown', 'code', left(p_raw, 80));
  end if;
  select * into v_st from public.students where code_key = v_key;
  if v_st.id is null then
    select * into v_st from public.students where barcode_key = v_key;
  end if;
  if v_st.id is null then
    v_digits := regexp_replace(v_key, '\D', '', 'g');
    if length(v_digits) >= 4 then
      select count(*) into v_n from public.students where regexp_replace(code_key, '\D', '', 'g') = v_digits;
      if v_n = 1 then
        select * into v_st from public.students where regexp_replace(code_key, '\D', '', 'g') = v_digits;
      end if;
    end if;
  end if;
  if v_st.id is null then
    return jsonb_build_object('result', 'unknown', 'code', left(p_raw, 80));
  end if;
  if not v_st.active then
    return jsonb_build_object('result', 'inactive', 'student', private.student_brief(v_st));
  end if;
  -- Offline scans carry their own time; ignore clocks that are obviously wrong.
  if v_at < v_s.starts_at - interval '6 hours' then
    v_at := now();
  end if;
  insert into public.attendance (session_id, student_id, status, method, marked_at, marked_by)
  values (p_session, v_st.id,
          case when v_at > v_s.starts_at + make_interval(mins => v_s.late_after_min) then 'late' else 'present' end::public.attendance_status,
          case when p_method = 'manual' then 'manual' else 'scan' end,
          v_at, auth.uid())
  on conflict (session_id, student_id) do nothing
  returning * into v_row;
  if v_row.student_id is null then
    select * into v_row from public.attendance where session_id = p_session and student_id = v_st.id;
    return jsonb_build_object('result', 'already', 'student', private.student_brief(v_st), 'status', v_row.status, 'at', v_row.marked_at);
  end if;
  return jsonb_build_object('result', 'marked', 'student', private.student_brief(v_st), 'status', v_row.status, 'at', v_row.marked_at);
end $$;

-- Sessions + compact records for reports and the attendance sheet export.
create or replace function public.staff_attendance_data(p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'now', now(),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'group', s.group_name, 'startsAt', s.starts_at,
          'closed', s.closed_at is not null) order by s.starts_at)
        from public.attendance_sessions s
       where p_group is null or s.group_name in ('', p_group)), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(jsonb_build_array(a.session_id, a.student_id, a.status))
        from public.attendance a
        join public.attendance_sessions s on s.id = a.session_id
       where p_group is null or s.group_name in ('', p_group)), '[]'::jsonb));
end $$;

create or replace function public.staff_regrade_quiz(p_quiz uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in select id, answers from public.quiz_attempts where quiz_id = p_quiz and submitted_at is not null loop
    perform private.grade_attempt(r.id, r.answers, null, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────── first-run setup (called by the staff-admin edge function with the service role only)
create or replace function public.app_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ready', exists (select 1 from public.staff where role = 'owner' and active))
$$;

create or replace function public.bootstrap_check(p_code text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.staff where role = 'owner' and active)
     and exists (select 1 from private.app_config
                  where key = 'setup_code_sha256'
                    and value = encode(extensions.digest(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), 'sha256'), 'hex'))
$$;

create or replace function public.bootstrap_finish(p_code text, p_user uuid, p_email text, p_name text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(4242);
  if not public.bootstrap_check(p_code) then
    return false;
  end if;
  insert into public.staff (user_id, email, full_name, role) values (p_user, lower(p_email), left(coalesce(p_name, ''), 120), 'owner')
  on conflict (user_id) do update set role = 'owner', active = true, email = excluded.email, full_name = excluded.full_name;
  -- The setup code works once.
  update private.app_config set value = 'used', updated_at = now() where key = 'setup_code_sha256';
  insert into public.audit_log (actor, actor_email, action, entity, entity_id) values (p_user, lower(p_email), 'bootstrap', 'staff', p_user::text);
  return true;
end $$;

create or replace function public.auth_user_id(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- ─────────────────────────────────────────────────────────────── function privileges
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_staff(), private.is_admin(), private.is_owner() to authenticated;

revoke execute on function public.bootstrap_check(text), public.bootstrap_finish(text, uuid, text, text), public.auth_user_id(text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_check(text), public.bootstrap_finish(text, uuid, text, text), public.auth_user_id(text)
  to service_role;

revoke execute on function public.staff_list_students(), public.staff_set_pins(uuid[], boolean),
  public.attendance_scan(uuid, text, timestamptz, text), public.staff_attendance_data(text), public.staff_regrade_quiz(uuid)
  from public, anon;
grant execute on function public.staff_list_students(), public.staff_set_pins(uuid[], boolean),
  public.attendance_scan(uuid, text, timestamptz, text), public.staff_attendance_data(text), public.staff_regrade_quiz(uuid)
  to authenticated;

grant execute on function public.app_status(), public.student_login(text, text), public.student_logout(text),
  public.student_change_pin(text, text, text), public.student_home(text), public.student_quiz_start(text, uuid),
  public.student_quiz_save(text, uuid, jsonb), public.student_quiz_submit(text, uuid, jsonb), public.student_quiz_review(text, uuid)
  to anon, authenticated;

-- These two only touch tables staff can already reach through RLS: run them with the caller's rights.
grant execute on function private.code_key(text), private.student_brief(public.students) to authenticated;
alter function public.attendance_scan(uuid, text, timestamptz, text) security invoker;
alter function public.staff_attendance_data(text) security invoker;
