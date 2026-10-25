-- No-shows: a warning first, then a ban. Whoever registers and doesn't come (an event they booked, a
-- form with QR attendance they were accepted in, or an expo delegation) gets a warning the first time;
-- the second time (while the warning still stands) they're banned. Banned people can't register for
-- anything: forms, events, the join application, the family form, or the "tell me when it opens" list;
-- each says so. Lifting a ban also clears their warnings (a fresh start).
--
-- It only counts what ended after this was turned on, and only where the team actually scanned people
-- in (an event or form with nobody checked in is skipped, so a day nobody scanned can't ban anyone).
-- Phones are compared by number, whatever way they were typed (+20…, 01…, Arabic digits).

-- ── Matching people ────────────────────────────────────────────────────────────────────────────────

create or replace function private.phone_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.wa_phone(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
$$;

create or replace function private.is_banned(p_phone text, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.community_bans b
                  where b.lifted_at is null
                    and ((private.phone_key(p_phone) is not null and private.phone_key(b.phone) = private.phone_key(p_phone))
                         or (p_student is not null and b.student_id = p_student)))
$$;

-- ── Warnings ───────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.community_strikes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete set null,
  phone text,
  name text,
  reason text not null,
  outcome text not null check (outcome in ('warning', 'ban')),
  ref text not null unique,
  form_id uuid references public.forms (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid
);
create index if not exists community_strikes_phone_idx on public.community_strikes (private.phone_key(phone)) where lifted_at is null;
alter table public.community_strikes enable row level security;
create policy community_strikes_select on public.community_strikes for select to authenticated
  using ((select private.can_read('forms')) or (select private.can_read('expo')) or (select private.can_read('roster')));
revoke all on public.community_strikes from anon;
grant select on public.community_strikes to authenticated;

create or replace function private.has_strike(p_phone text, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.community_strikes s
                  where s.lifted_at is null
                    and ((private.phone_key(p_phone) is not null and private.phone_key(s.phone) = private.phone_key(p_phone))
                         or (p_student is not null and s.student_id = p_student)))
$$;

-- When the rule started: only no-shows from things that ended after this count.
create table if not exists private.no_show_policy (
  id int primary key default 1 check (id = 1),
  started_at timestamptz not null default now()
);
insert into private.no_show_policy (id) values (1) on conflict (id) do nothing;

-- One no-show: a warning, or a ban if they already have a warning. Once per ref (a registration).
create or replace function private.no_show(p_phone text, p_student uuid, p_name text, p_what text, p_ref text, p_form uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ban boolean;
  v_id uuid;
begin
  if exists (select 1 from public.community_strikes where ref = p_ref) then
    return 'skip';
  end if;
  if private.phone_key(p_phone) is null and p_student is null then
    return 'skip';
  end if;
  if private.is_banned(p_phone, p_student) then
    return 'skip';
  end if;
  v_ban := private.has_strike(p_phone, p_student);
  insert into public.community_strikes (student_id, phone, name, reason, outcome, ref, form_id)
  values (p_student, p_phone, p_name, 'اتسجل في «' || p_what || '» ومجاش', case when v_ban then 'ban' else 'warning' end, p_ref, p_form)
  returning id into v_id;
  if v_ban then
    insert into public.community_bans (student_id, phone, name, reason, form_id)
    values (p_student, p_phone, p_name, 'اتسجل ومجاش مرتين بعد إنذار (آخرهم «' || p_what || '»)', p_form);
    perform private.wa_auto('no_show_ban', p_phone, p_name, jsonb_build_array(private.wa_first(p_name), p_what), 'strike:' || v_id);
    perform private.notify_staff('forms', '⛔ حظر تلقائي: ' || coalesce(nullif(p_name, ''), p_phone, ''),
                                 'اتسجل ومجاش مرتين، آخرهم «' || p_what || '».', '/app/#/staff/bans');
    return 'banned';
  end if;
  perform private.wa_auto('no_show_warning', p_phone, p_name, jsonb_build_array(private.wa_first(p_name), p_what), 'strike:' || v_id);
  return 'warned';
end $$;

-- Every hour: events and forms with QR attendance that ended at least 2–3 hours ago.
create or replace function private.no_show_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (select started_at from private.no_show_policy where id = 1);
  x record;
  v_out text;
  v_warned int := 0;
  v_banned int := 0;
begin
  if v_start is null then
    return '{}'::jsonb;
  end if;

  -- Events: booked a place, didn't get scanned in, at an event where the team scanned people.
  for x in select r.id, r.full_name, r.phone, coalesce(nullif(e.title_ar, ''), e.title) as title
             from public.event_registrations r join public.site_content e on e.id = r.event_id
            where r.status = 'going' and r.checked_in_at is null
              and coalesce(e.ends_at, e.starts_at + interval '3 hours') between v_start and now() - interval '2 hours'
              and exists (select 1 from public.event_registrations y where y.event_id = e.id and y.checked_in_at is not null)
              and not exists (select 1 from public.community_strikes k where k.ref = 'event:' || r.id) loop
    v_out := private.no_show(x.phone, null, x.full_name, x.title, 'event:' || x.id);
    v_warned := v_warned + (v_out = 'warned')::int;
    v_banned := v_banned + (v_out = 'banned')::int;
  end loop;

  -- Forms with QR attendance (not expo delegations, they have their own day): came to none of their
  -- sessions, after the last one ended. Accepted people, or everyone when the form doesn't accept.
  for x in select r.id, r.name, r.phone, r.student_id, f.id as fid, f.title_ar, t.end_at
             from public.forms f
             join public.form_responses r on r.form_id = f.id
             cross join lateral (
               select case when count(*) > 0 and count(*) = count(*) filter (where coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}')
                           then max(case when coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}' then (s ->> 'at')::timestamptz end)
                           else f.event_at end + interval '3 hours' as end_at
                 from jsonb_array_elements(private.form_sessions(f.attendance)) s
                where private.form_session_for(f.attendance, s, r.answers)) t
            where coalesce(f.attendance ->> 'on', 'false') = 'true' and f.delegation is null and not coalesce(f.archived, false)
              and t.end_at between v_start and now()
              and r.status <> 'rejected'
              and (r.status = 'accepted' or not exists (select 1 from public.form_responses y
                                                         where y.form_id = f.id and y.status in ('accepted', 'rejected')))
              and not exists (select 1 from public.form_attendance a where a.response_id = r.id and a.present)
              and not exists (select 1 from public.community_strikes k where k.ref = 'form:' || r.id)
              and exists (select 1 from public.form_attendance a join public.form_responses y on y.id = a.response_id
                           where y.form_id = f.id and a.present) loop
    v_out := private.no_show(x.phone, x.student_id, x.name, x.title_ar, 'form:' || x.id, x.fid);
    v_warned := v_warned + (v_out = 'warned')::int;
    v_banned := v_banned + (v_out = 'banned')::int;
  end loop;
  return jsonb_build_object('warned', v_warned, 'banned', v_banned);
end $$;

select cron.schedule('no-show-tick', '29 * * * *', 'select private.no_show_tick()');

-- Expo delegations: the day after the visit, the same rule (a warning first) instead of a straight ban.
create or replace function private.expo_daily()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  r public.form_responses;
  v_now timestamp := now() at time zone 'Africa/Cairo';
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_reminded int := 0;
  v_banned int := 0;
  v_warned int := 0;
  v_out text;
  d date;
begin
  for f in select * from public.forms where delegation is not null and not archived loop
    if f.delegation ->> 'remind' = 'true' and extract(hour from v_now) >= 12 then
      for r in select * from public.form_responses x
                where x.form_id = f.id and x.status = 'accepted' and x.reminded_at is null and x.checked_in_at is null
                  and private.delegate_date(f.delegation, x.answers) = v_today + 1
                limit 300 loop
        if private.expo_wa(f, r, 'remind_template') then
          update public.form_responses set reminded_at = now() where id = r.id;
          v_reminded := v_reminded + 1;
        end if;
      end loop;
    end if;
    if f.delegation ->> 'auto_no_show' = 'true' then
      for d in select distinct private.delegate_date(f.delegation, x.answers) from public.form_responses x
                where x.form_id = f.id and x.status = 'accepted' and x.checked_in_at is not null loop
        continue when d is null or d > v_today or (d = v_today and extract(hour from v_now) < 22);
        for r in select * from public.form_responses x
                  where x.form_id = f.id and x.status = 'accepted' and x.checked_in_at is null and x.no_show_at is null
                    and private.delegate_date(f.delegation, x.answers) = d loop
          update public.form_responses set no_show_at = now() where id = r.id;
          v_out := private.no_show(r.phone, r.student_id, r.name, 'وفد ' || f.title_ar, 'form:' || r.id, f.id);
          v_warned := v_warned + (v_out = 'warned')::int;
          v_banned := v_banned + (v_out = 'banned')::int;
        end loop;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'warned', v_warned, 'banned', v_banned);
end $$;

-- The delegation's "didn't come" button: the same warning-then-ban rule.
create or replace function public.staff_delegation_no_shows(p_form uuid, p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  v_list jsonb;
  r record;
  v_out text;
  n int := 0;
  w int := 0;
begin
  if not (private.can('forms') or private.can('expo')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.forms where id = p_form;
  if not found or f.delegation is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone, 'no', x.member_no, 'student_id', x.student_id,
           'banned', private.is_banned(x.phone, x.student_id), 'warned', private.has_strike(x.phone, x.student_id),
           'done', exists (select 1 from public.community_strikes s where s.ref = 'form:' || x.id)) order by x.member_no), '[]'::jsonb)
    into v_list
    from public.form_responses x where x.form_id = p_form and x.status = 'accepted' and x.checked_in_at is null;
  if not p_apply then
    return jsonb_build_object('people', v_list, 'applied', 0, 'warned', 0);
  end if;
  for r in select x.* from public.form_responses x
            where x.form_id = p_form and x.status = 'accepted' and x.checked_in_at is null loop
    v_out := private.no_show(r.phone, r.student_id, r.name, 'وفد ' || f.title_ar, 'form:' || r.id, p_form);
    n := n + (v_out = 'banned')::int;
    w := w + (v_out = 'warned')::int;
  end loop;
  return jsonb_build_object('people', v_list, 'applied', n, 'warned', w);
end $$;

-- Lift a warning by hand; lifting a ban clears the person's warnings too.
create or replace function public.staff_lift_strike(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.can('forms') or private.can('expo') or private.can('roster')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.community_strikes set lifted_at = now(), lifted_by = auth.uid() where id = p_id and lifted_at is null;
end $$;
revoke execute on function public.staff_lift_strike(uuid) from public, anon;
grant execute on function public.staff_lift_strike(uuid) to authenticated;

do $$
declare
  def text := pg_get_functiondef('public.staff_lift_ban(uuid, boolean)'::regprocedure);
  anchor text := E'  if b.id is not null and p_restore and b.student_id is not null then\n';
begin
  if position('community_strikes' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'staff_lift_ban changed';
  end if;
  def := replace(def, anchor,
    E'  if b.id is not null then\n'
    || E'    update public.community_strikes set lifted_at = now(), lifted_by = auth.uid()\n'
    || E'     where lifted_at is null and ((b.student_id is not null and student_id = b.student_id)\n'
    || E'                                  or (private.phone_key(b.phone) is not null and private.phone_key(phone) = private.phone_key(b.phone)));\n'
    || E'  end if;\n'
    || anchor);
  execute def;
end $$;

-- ── Banned people can't register for anything ──────────────────────────────────────────────────────

do $$
declare
  def text := pg_get_functiondef('public.register_event(uuid, jsonb)'::regprocedure);
  a1 text := E'\n  select * into v_ev from public.site_content';
  a2 text := E'  return jsonb_build_object(''ok'', true, ''ticket'', v_ticket, ''status'', v_status);';
begin
  if position('is_banned' in def) > 0 then
    return;
  end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then
    raise exception 'register_event changed';
  end if;
  def := replace(def, a1, E'\n  if private.is_banned(v_phone, null) then\n    return jsonb_build_object(''ok'', false, ''error'', ''banned'');\n  end if;\n' || a1);
  def := replace(def, a2, E'  return jsonb_build_object(''ok'', true, ''ticket'', v_ticket, ''status'', v_status)\n'
                          || E'         || case when private.has_strike(v_phone, null) then ''{"warned": true}''::jsonb else ''{}''::jsonb end;');
  execute def;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.submit_family(jsonb)'::regprocedure);
  anchor text := E'  -- Flood guard for the whole form.\n';
begin
  if position('is_banned' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'submit_family changed';
  end if;
  def := replace(def, anchor, E'  if private.is_banned(v_phone, null) then\n    return jsonb_build_object(''ok'', false, ''error'', ''banned'');\n  end if;\n\n' || anchor);
  execute def;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.join_waitlist(jsonb)'::regprocedure);
  anchor text := E'  if exists (select 1 from public.waitlist';
begin
  if position('is_banned' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'join_waitlist changed';
  end if;
  def := replace(def, anchor, E'  if private.is_banned(v_phone, null) then\n    return jsonb_build_object(''ok'', false, ''error'', ''banned'');\n  end if;\n' || anchor);
  execute def;
end $$;

-- A form sent by someone with a warning says so on the thank-you screen.
do $$
declare
  def text := pg_get_functiondef('public.submit_form(text, jsonb, text, text)'::regprocedure);
  anchor text := E'jsonb_build_object(''ok'', true, ''ref'', v_text, ''pass'', v_pass)';
begin
  if position('has_strike' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'submit_form changed';
  end if;
  def := replace(def, anchor, E'jsonb_build_object(''ok'', true, ''ref'', v_text, ''pass'', v_pass, ''warned'', nullif(private.has_strike(v_phone, v_student), false))');
  execute def;
end $$;

-- ── The WhatsApp messages ─────────────────────────────────────────────────────────────────────────

insert into private.wa_templates (name, category, moments, example, body) values
  ('bx_no_show_warning_v5', 'UTILITY', '{no_show_warning}', '{أحمد,Workshop 01 — Embedded Systems}',
   'أهلًا {{1}}، كنت مسجّل في «{{2}}» مع BuildX HUE ومحضرتش. دي أول مرة فاعتبرها إنذار: لو سجّلت في حاجة تانية ومحضرتش هيتعمل حظر من التسجيل. لو كان عندك ظرف ابعتلنا هنا.'),
  ('bx_no_show_ban_v5', 'UTILITY', '{no_show_ban}', '{أحمد,Workshop 01 — Embedded Systems}',
   'أهلًا {{1}}، كنت مسجّل في «{{2}}» مع BuildX HUE ومحضرتش، ودي المرة التانية بعد الإنذار، فاتعمل حظر من التسجيل في فعالياتنا. لو شايف إن ده غلط ابعتلنا هنا.')
on conflict (name) do update set category = excluded.category, moments = excluded.moments, example = excluded.example, body = excluded.body
 where private.wa_templates.meta_id is null;

insert into private.wa_auto_rules (key, section, sort, label_ar, hint_ar, vars_ar, template, lang, enabled, bulk, enabled_at) values
  ('no_show_warning', 'events', 70, 'إنذار لما يسجل وميجيش',
   'أول مرة حد يتسجل (فعالية، فورم بالـ QR، وفد) ومحضرش، بعد ما تخلص بساعتين',
   '{{1}} الاسم الأول · {{2}} اللي سجل فيه', 'bx_no_show_warning_v5', 'ar', true, false, now()),
  ('no_show_ban', 'events', 71, 'حظر بعد الإنذار',
   'تاني مرة يسجل وميجيش وعليه إنذار: بيتعمل حظر من التسجيل',
   '{{1}} الاسم الأول · {{2}} اللي سجل فيه', 'bx_no_show_ban_v5', 'ar', true, false, now())
on conflict (key) do update set section = excluded.section, sort = excluded.sort, label_ar = excluded.label_ar,
  hint_ar = excluded.hint_ar, vars_ar = excluded.vars_ar, template = excluded.template;
