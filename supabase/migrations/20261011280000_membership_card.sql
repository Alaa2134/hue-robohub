-- The digital membership card: every member has a card code that can't be guessed (BXM-XXXXXXXXXX,
-- shown as a QR in the student app) and an optional "member until" date. Staff scan the card at the
-- door (valid / expired / stopped / banned, and an optional check-in to an event), the card also works
-- for attendance and for "membership required" forms, and members get a reminder two weeks before it ends.

-- ── Columns ──────────────────────────────────────────────────────────────────────────────────────
alter table public.students
  add column if not exists member_until date,
  add column if not exists card_token text default ('BXM-' || upper(encode(extensions.gen_random_bytes(5), 'hex'))),
  add column if not exists renew_reminded_at timestamptz;

update public.students set card_token = 'BXM-' || upper(encode(extensions.gen_random_bytes(5), 'hex')) where card_token is null;
alter table public.students alter column card_token set not null;
alter table public.students add constraint students_card_token_check check (card_token ~ '^BXM-[0-9A-F]{10}$');
create unique index if not exists students_card_token_key on public.students (card_token);

-- A new end date means a new reminder.
create or replace function private.students_member_until_changed()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.member_until is distinct from old.member_until then
    new.renew_reminded_at := null;
  end if;
  return new;
end $$;
create trigger students_member_until_changed before update of member_until on public.students
  for each row execute function private.students_member_until_changed();

-- ── Helpers ──────────────────────────────────────────────────────────────────────────────────────
create or replace function private.cairo_today()
returns date
language sql
stable
set search_path to ''
as $$ select (now() at time zone 'Africa/Cairo')::date $$;

/** The card code inside whatever was scanned or typed ("bxm-…", a link holding it…), or null. */
create or replace function private.card_of(p text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case when m is null then null else 'BXM-' || upper(m[1]) end
  from (select regexp_match(coalesce(p, ''), 'BXM-?([0-9A-F]{10})', 'i') m) t
$$;

create or replace function private.member_state(s public.students)
returns text
language sql
stable
set search_path to ''
as $$
  select case
    when not s.active then 'stopped'
    when s.member_until is null then 'open'
    when s.member_until < private.cairo_today() then 'expired'
    when s.member_until <= private.cairo_today() + 14 then 'expiring'
    else 'active'
  end
$$;

revoke execute on function private.students_member_until_changed() from public, anon, authenticated;
revoke execute on function private.cairo_today() from public, anon;
revoke execute on function private.card_of(text) from public, anon;
revoke execute on function private.member_state(public.students) from public, anon;
grant execute on function private.cairo_today() to authenticated;
grant execute on function private.card_of(text) to authenticated;

-- ── The member's own card (student app) ───────────────────────────────────────────────────────────
create or replace function public.student_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_st public.students%rowtype;
begin
  select * into v_st from public.students where id = private.session_student(p_token);
  return jsonb_build_object(
    'name', v_st.full_name,
    'code', v_st.code,
    'group', v_st.group_name,
    'card', v_st.card_token,
    'since', v_st.created_at,
    'until', v_st.member_until,
    'state', private.member_state(v_st),
    'daysLeft', case when v_st.member_until is null then null else v_st.member_until - private.cairo_today() end
  );
end $$;
revoke all on function public.student_card(text) from public;
grant execute on function public.student_card(text) to anon, authenticated;

-- ── Check-ins of members at events (scanned from their card) ─────────────────────────────────────
-- (Plain ids: a row whose event or student is gone is simply never matched again.)
create table if not exists public.event_member_checkins (
  event_id uuid not null,
  student_id uuid not null,
  at timestamptz not null default now(),
  checked_by uuid,
  primary key (event_id, student_id)
);
alter table public.event_member_checkins enable row level security;
create policy "staff read member check-ins" on public.event_member_checkins for select to authenticated using (private.can_read('events'));

-- ── Staff scan a card ─────────────────────────────────────────────────────────────────────────────
create or replace function public.staff_member_scan(p_raw text, p_event uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_st public.students%rowtype;
  v_card text := private.card_of(p_raw);
  v_key text := private.code_key(p_raw);
  v_state text;
  v_banned boolean;
  v_event jsonb;
  v_n int;
begin
  if not (private.can('events') or private.can('expo') or private.can('attendance') or private.can_read('roster')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_card is not null then
    select * into v_st from public.students where card_token = v_card;
  elsif v_key is not null then
    select * into v_st from public.students where code_key = v_key;
    if v_st.id is null then
      select * into v_st from public.students where barcode_key = v_key;
    end if;
  end if;
  if v_st.id is null then
    return jsonb_build_object('result', 'unknown', 'code', left(coalesce(p_raw, ''), 80));
  end if;

  v_state := private.member_state(v_st);
  v_banned := private.is_banned(v_st.phone, v_st.id);
  if p_event is not null and v_state in ('open', 'active', 'expiring') and not v_banned then
    if not private.can('events') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not exists (select 1 from public.site_content where id = p_event and kind = 'event') then
      return jsonb_build_object('result', 'no_event');
    end if;
    insert into public.event_member_checkins (event_id, student_id, checked_by)
    values (p_event, v_st.id, auth.uid())
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_event := jsonb_build_object('checkedIn', true, 'already', v_n = 0, 'count', (select count(*) from public.event_member_checkins where event_id = p_event));
  end if;

  return jsonb_build_object(
    'result', case when v_banned then 'banned' when v_state in ('expired', 'stopped') then v_state else 'ok' end,
    'student', jsonb_build_object('name', v_st.full_name, 'code', v_st.code, 'group', v_st.group_name, 'until', v_st.member_until, 'state', v_state),
    'event', v_event
  );
end $$;
revoke all on function public.staff_member_scan(text, uuid) from public, anon;
grant execute on function public.staff_member_scan(text, uuid) to authenticated;

-- ── Staff set the end date for many members at once ───────────────────────────────────────────────
create or replace function public.staff_set_member_until(p_ids uuid[], p_until date)
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n int;
begin
  if not private.can('roster') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_until is not null and p_until < private.cairo_today() - 366 then
    raise exception 'bad date' using errcode = '22023';
  end if;
  update public.students set member_until = p_until, updated_at = now() where id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.staff_set_member_until(uuid[], date) from public, anon;
grant execute on function public.staff_set_member_until(uuid[], date) to authenticated;

-- ── The list in the app shows the end date ────────────────────────────────────────────────────────
select private.patch_function(
  'public.staff_list_students()'::regprocedure,
  $f$'createdAt', s.created_at, 'hasPin'$f$,
  $f$'createdAt', s.created_at, 'memberUntil', s.member_until, 'hasPin'$f$
);

-- ── The card works where the student code works ───────────────────────────────────────────────────
-- Attendance: the card's QR marks the student like their code does.
select private.patch_function(
  'public.attendance_scan(uuid, text, timestamptz, text)'::regprocedure,
  $f$  select * into v_st from public.students where code_key = v_key;
  if v_st.id is null then
    select * into v_st from public.students where barcode_key = v_key;$f$,
  $f$  select * into v_st from public.students where card_token = private.card_of(p_raw);
  if v_st.id is null then
    select * into v_st from public.students where code_key = v_key;
  end if;
  if v_st.id is null then
    select * into v_st from public.students where barcode_key = v_key;$f$
);

-- "Membership required" forms: the code or the card, and the membership must not have ended.
select private.patch_function(
  'public.submit_form(text, jsonb, text, text)'::regprocedure,
  $f$from public.students s where s.active and s.code_key = private.code_key(v_text);$f$,
  $f$from public.students s where s.active and (s.member_until is null or s.member_until >= private.cairo_today()) and (s.code_key = private.code_key(v_text) or s.card_token = private.card_of(v_text));$f$
);

-- ── Two weeks before the end: a reminder on the member's phone ────────────────────────────────────
create or replace function private.membership_sweep()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
begin
  for r in
    update public.students s
       set renew_reminded_at = now()
     where s.active and s.renew_reminded_at is null
       and s.member_until between private.cairo_today() and private.cairo_today() + 14
    returning s.id, s.member_until
  loop
    perform private.notify_student_ids(
      array[r.id],
      'عضويتك في BuildX قرّبت تخلص',
      'العضوية سارية لحد ' || to_char(r.member_until, 'DD/MM') || '. جدّدها عشان تفضل تحضر الفعاليات والمعارض.',
      '/app/#/me/card'
    );
  end loop;
end $$;
revoke execute on function private.membership_sweep() from public, anon, authenticated;

select cron.schedule('buildx-membership', '23 7 * * *', $$select private.membership_sweep()$$);
