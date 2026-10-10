-- Expo delegations that run themselves (each part is switched on in the form's delegation settings).
--  * Dates: each visit-day choice gets its date ("day_dates"; or one "visit_date" when the form has no
--    day question). The other parts go by each delegate's own day.
--  * Waiting list ("auto_waitlist"): once the delegation is full, accepting someone puts them on the
--    waiting list instead of refusing; when an accepted person leaves the list (or the team adds seats) the
--    first on the list moves in, with their delegation number.
--  * Acceptance message ("accept_template"): an approved WhatsApp template goes out by itself to everyone
--    accepted (moved in from the waiting list too). Its {{1}}…{{5}} are: first name, visit day, meeting
--    point and times, delegation number, the expo's name.
--  * Reminder ("remind" + "remind_template"): the day before their visit (from noon, Cairo time).
--  * No-shows ("auto_no_show"): after their visit day (10 pm Cairo), whoever was accepted and didn't scan
--    in is banned from the community and loses the membership, as they agreed when applying. Only for a
--    day the team actually scanned people in, so a day nobody used the scanner never bans anyone.
--  WhatsApp parts do nothing while WhatsApp isn't connected (the team can still send by hand).

alter table public.form_responses
  add column if not exists waitlisted_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists no_show_at timestamptz;

/** The day a delegate visits: their chosen day's date, else the delegation's visit date. */
create or replace function private.delegate_date(p_delegation jsonb, p_answers jsonb) returns date
language sql immutable set search_path = ''
as $$
  select case when d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then d::date end
    from (select coalesce(p_delegation -> 'day_dates' ->> (p_answers ->> 'day'), p_delegation ->> 'visit_date') as d) x
$$;
revoke execute on function private.delegate_date(jsonb, jsonb) from public, anon, authenticated;

/** One of the delegation's WhatsApp templates ("name|language") to one delegate. False when it can't go. */
create or replace function private.expo_wa(p_form public.forms, p_r public.form_responses, p_key text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_tpl text := p_form.delegation ->> p_key;
  v_name text;
  v_lang text;
  v_body text;
  v_n int;
  v_phone text := private.wa_phone(p_r.phone);
  v_vals text[];
begin
  if v_tpl is null or v_tpl !~ '^[a-z0-9_]+\|[A-Za-z_]{2,6}$' or v_phone is null
     or not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
    return false;
  end if;
  v_name := split_part(v_tpl, '|', 1);
  v_lang := split_part(v_tpl, '|', 2);
  select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
   where a.id = 1 and t ->> 'name' = v_name and t ->> 'language' = v_lang limit 1;
  v_n := least(5, coalesce((select max((m[1])::int) from regexp_matches(coalesce(v_body, ''), '\{\{([0-9]+)\}\}', 'g') m), 0));
  v_vals := array[
    coalesce(nullif(split_part(btrim(coalesce(p_r.name, '')), ' ', 1), ''), '-'),
    coalesce(nullif(p_r.answers ->> 'day', ''), nullif(p_form.delegation ->> 'dates', ''), '-'),
    coalesce(nullif(p_form.delegation ->> 'meet_ar', ''), '-'),
    case when p_r.member_no is null then '-' else 'BX-' || lpad(p_r.member_no::text, 3, '0') end,
    coalesce(nullif(p_form.delegation ->> 'event', ''), p_form.title_ar)];
  perform private.wa_send(v_phone, p_r.name, null, v_name, v_lang, coalesce(to_jsonb(v_vals[1:v_n]), '[]'::jsonb), 'expo:' || p_form.id, null);
  return true;
exception when others then
  return false;
end $$;
revoke execute on function private.expo_wa(public.forms, public.form_responses, text) from public, anon, authenticated;

-- Full: on the waiting list instead of refused (when the delegation has it switched on).
select private.patch_function('private.on_form_accept()',
  $p$    raise exception 'delegation_full' using errcode = '23514';$p$,
  $p$    if f.delegation ->> 'auto_waitlist' = 'true' then
      new.status := 'waiting';
      new.accepted_at := null;
      new.waitlisted_at := coalesce(new.waitlisted_at, now());
      return new;
    end if;
    raise exception 'delegation_full' using errcode = '23514';$p$);

/** Moves people from the waiting list into free seats (first come, first in), before their visit day. */
create or replace function private.expo_fill(p_form uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
  v_free int;
  v_id uuid;
  n int := 0;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  select * into f from public.forms where id = p_form;
  if f.delegation is null or f.capacity is null or f.delegation ->> 'auto_waitlist' is distinct from 'true' then
    return 0;
  end if;
  v_free := f.capacity - (select count(*) from public.form_responses where form_id = p_form and status = 'accepted');
  while v_free > 0 loop
    v_id := null;
    select r.id into v_id from public.form_responses r
     where r.form_id = p_form and r.status = 'waiting'
       and coalesce(private.delegate_date(f.delegation, r.answers), v_today) >= v_today
     order by coalesce(r.waitlisted_at, r.created_at), r.created_at limit 1;
    exit when v_id is null;
    update public.form_responses set status = 'accepted' where id = v_id;
    v_free := v_free - 1;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.expo_fill(uuid) from public, anon, authenticated;

/** When they went on the waiting list. */
create or replace function private.on_response_waiting() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'waiting' and (tg_op = 'INSERT' or old.status is distinct from 'waiting') then
    new.waitlisted_at := coalesce(new.waitlisted_at, now());
  end if;
  return new;
end $$;
revoke execute on function private.on_response_waiting() from public, anon, authenticated;
create or replace trigger form_responses_waiting before insert or update of status on public.form_responses
  for each row execute function private.on_response_waiting();

/** After a status change on a delegation: the acceptance message, and a freed seat filled from the list. */
create or replace function private.on_delegate_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
begin
  select * into f from public.forms where id = new.form_id;
  if f.delegation is null then
    return null;
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') and new.messaged_at is null then
    if private.expo_wa(f, new, 'accept_template') then
      update public.form_responses set messaged_at = now() where id = new.id;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    perform private.expo_fill(new.form_id);
  end if;
  return null;
end $$;
revoke execute on function private.on_delegate_status() from public, anon, authenticated;
create or replace trigger form_responses_delegate_status after insert or update of status on public.form_responses
  for each row execute function private.on_delegate_status();

/** More seats (or the waiting list switched on): fill them. */
create or replace function private.on_delegation_seats() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.delegation is not null and (new.capacity is distinct from old.capacity or new.delegation is distinct from old.delegation) then
    perform private.expo_fill(new.id);
  end if;
  return null;
end $$;
revoke execute on function private.on_delegation_seats() from public, anon, authenticated;
create or replace trigger forms_delegation_seats after update of capacity, delegation on public.forms
  for each row execute function private.on_delegation_seats();

/** Every hour: tomorrow's reminders and yesterday's no-shows, for the delegations that have them on. */
create or replace function private.expo_daily() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
  r public.form_responses;
  v_now timestamp := now() at time zone 'Africa/Cairo';
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_reminded int := 0;
  v_banned int := 0;
  d date;
begin
  for f in select * from public.forms where delegation is not null and not archived loop
    -- Reminders: the day before, from noon.
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
    -- No-shows: after their day (10 pm Cairo), only for days the team scanned people in.
    if f.delegation ->> 'auto_no_show' = 'true' then
      for d in select distinct private.delegate_date(f.delegation, x.answers) from public.form_responses x
                where x.form_id = f.id and x.status = 'accepted' and x.checked_in_at is not null loop
        continue when d is null or d > v_today or (d = v_today and extract(hour from v_now) < 22);
        for r in select * from public.form_responses x
                  where x.form_id = f.id and x.status = 'accepted' and x.checked_in_at is null and x.no_show_at is null
                    and private.delegate_date(f.delegation, x.answers) = d loop
          update public.form_responses set no_show_at = now() where id = r.id;
          if not private.is_banned(r.phone, r.student_id) then
            insert into public.community_bans (student_id, phone, name, reason, form_id)
            values (r.student_id, r.phone, r.name, 'اتقبل في وفد «' || f.title_ar || '» ومحضرش', f.id);
            if r.student_id is not null then
              update public.students set active = false where id = r.student_id;
            end if;
            v_banned := v_banned + 1;
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'banned', v_banned);
end $$;
revoke execute on function private.expo_daily() from public, anon, authenticated;

select cron.schedule('expo-daily', '7 * * * *', $$select private.expo_daily()$$);
