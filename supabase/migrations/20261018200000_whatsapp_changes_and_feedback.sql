-- Three more WhatsApp moments so nothing on the site happens silently:
--   event_changed         a published event's time changes → everyone booked or waiting, with the ticket
--   form_session_changed  a QR-attendance session (or the form's event date) moves → the people it is for
--   event_feedback        an hour or more after an event → those checked in: thanks and a link to rate it
-- Each has its own template (sent to Meta here); until Meta approves, the time changes go out with the
-- approved event reminder template carrying the new day, time and QR link.

insert into private.wa_templates (name, category, moments, example, body, button_text, button_url, button_example) values
('bx_event_changed_v5', 'UTILITY', '{event_changed}', '{"Arduino Workshop","الثلاثاء 20 أكتوبر","2:00 م"}',
'تم تعديل موعد {{1}} من BuildX HUE، والموعد الجديد يوم {{2}} الساعة {{3}}. تذكرتك (QR) زي ما هي، ولو الموعد الجديد مش مناسب رد على الرسالة دي.',
 'تذكرتي', 'https://buildxhue.com/ar/ticket/?t={{1}}', 'https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D'),
('bx_form_session_changed_v5', 'UTILITY', '{form_session_changed}', '{"Workshop 01 — اليوم الأول","الثلاثاء 20 أكتوبر","2:00 م"}',
'تم تعديل موعد {{1}} من BuildX HUE، والموعد الجديد يوم {{2}} الساعة {{3}}. الـ QR بتاعك زي ما هو، ولو الموعد الجديد مش مناسب رد على الرسالة دي.',
 'الـ QR بتاعي', 'https://buildxhue.com/ar/form/?pass={{1}}', 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012'),
('bx_event_feedback_v5', 'UTILITY', '{event_feedback}', '{"Arduino Workshop"}',
'شكرًا إنك حضرت {{1}} مع BuildX HUE 💙 رأيك بيفرق معانا، قيّم الفعالية في دقيقة من تذكرتك على الموقع.',
 'قيّم الفعالية', 'https://buildxhue.com/ar/ticket/?t={{1}}', 'https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D')
on conflict (name) do nothing;

insert into private.wa_auto_rules (key, section, sort, label_ar, hint_ar, vars_ar, template, alts, lang, enabled, enabled_at, bulk) values
('event_changed', 'events', 45, 'تغيير ميعاد فعالية', 'لما تغيّر ميعاد فعالية منشورة، لكل اللي حاجزين أو في الانتظار',
 '{{1}} اسم الفعالية · {{2}} اليوم الجديد · {{3}} الساعة · زرار بيفتح تذكرته', 'bx_event_changed_v5', '{bx_event_reminder_v4}', 'ar', true, now(), false),
('event_feedback', 'events', 60, 'تقييم بعد الفعالية', 'بعد الفعالية بساعة على الأقل (بين 10 الصبح و9 بالليل)، للي اتسجل حضورهم',
 '{{1}} اسم الفعالية · زرار بيفتح تذكرته وفيها التقييم', 'bx_event_feedback_v5', '{}', 'ar', true, now(), false),
('form_session_changed', 'forms', 45, 'تغيير موعد حضور', 'لما تغيّر ميعاد موعد في «الحضور بالـ QR» أو ميعاد الفورم، للي الموعد ليهم',
 '{{1}} الفورم والموعد · {{2}} اليوم الجديد · {{3}} الساعة · زرار بيفتح الـ QR بتاعه', 'bx_form_session_changed_v5', '{bx_event_reminder_v4}', 'ar', true, now(), false)
on conflict (key) do nothing;

-- ───────────────────────────────────────────── an event's time changes
create or replace function private.site_content_wa_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  x record;
begin
  if new.kind::text <> 'event' or not new.published or new.starts_at is null or new.starts_at < now()
     or old.starts_at is not distinct from new.starts_at then
    return null;
  end if;
  for x in select id, full_name, phone, ticket from public.event_registrations
            where event_id = new.id and status in ('going', 'waitlist') loop
    perform private.wa_auto_btn('event_changed', x.phone, x.full_name,
      jsonb_build_array(coalesce(nullif(new.title_ar, ''), new.title), private.wa_day(new.starts_at), private.wa_time(new.starts_at), private.wa_first(x.full_name)),
      'event:' || x.id || ':at:' || to_char(new.starts_at at time zone 'UTC', 'YYYYMMDDHH24MI'), x.ticket);
  end loop;
  return null;
exception when others then
  return null;
end $$;
revoke all on function private.site_content_wa_changed() from public, anon, authenticated;
create or replace trigger site_content_wa_changed after update of starts_at on public.site_content
  for each row execute function private.site_content_wa_changed();

-- ───────────────────────────────────────────── a form's session (or its event date) moves
create or replace function private.forms_wa_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_reviewed boolean;
begin
  if new.delegation is not null then return null; end if;
  v_reviewed := exists (select 1 from public.form_responses y where y.form_id = new.id and y.status in ('accepted', 'rejected'));
  if coalesce(new.attendance ->> 'on', 'false') = 'true' then
    for x in select r.id, r.name, r.phone, r.pass, s ->> 'id' as sid, s ->> 'name' as sname, (s ->> 'at')::timestamptz as at
               from jsonb_array_elements(private.form_sessions(new.attendance)) s
               join jsonb_array_elements(private.form_sessions(old.attendance)) o on o ->> 'id' = s ->> 'id'
               join public.form_responses r on r.form_id = new.id
              where coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}' and (s ->> 'at')::timestamptz > now()
                and (s ->> 'at') is distinct from (o ->> 'at')
                and coalesce(old.attendance ->> 'on', 'false') = 'true'
                and r.status <> 'rejected' and (r.status = 'accepted' or not v_reviewed)
                and private.form_session_for(new.attendance, s, r.answers) loop
      perform private.wa_auto_btn('form_session_changed', x.phone, x.name,
        jsonb_build_array(new.title_ar || ' — ' || x.sname, private.wa_day(x.at), private.wa_time(x.at), private.wa_first(x.name)),
        'form:' || x.id || ':session:' || x.sid || ':at:' || to_char(x.at at time zone 'UTC', 'YYYYMMDDHH24MI'), lower(x.pass));
    end loop;
  elsif old.event_at is not null and new.event_at is distinct from old.event_at and new.event_at > now() then
    for x in select r.id, r.name, r.phone from public.form_responses r
              where r.form_id = new.id and r.status <> 'rejected' and (r.status = 'accepted' or not v_reviewed) loop
      perform private.wa_auto_btn('form_session_changed', x.phone, x.name,
        jsonb_build_array(new.title_ar, private.wa_day(new.event_at), private.wa_time(new.event_at), private.wa_first(x.name)),
        'form:' || x.id || ':at:' || to_char(new.event_at at time zone 'UTC', 'YYYYMMDDHH24MI'), null);
    end loop;
  end if;
  return null;
exception when others then
  return null;
end $$;
revoke all on function private.forms_wa_changed() from public, anon, authenticated;
create or replace trigger forms_wa_changed after update of attendance, event_at on public.forms
  for each row execute function private.forms_wa_changed();

-- ───────────────────────────────────────────── after an event: thanks and a rating link
create or replace function private.wa_auto_tick(p_any_hour boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hour int := case when p_any_hour then 12 else extract(hour from now() at time zone 'Africa/Cairo')::int end;
  v_since timestamptz;
  x record;
begin
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return; end if;

  -- Follow-ups the day after acceptance.
  v_since := private.wa_since('application_next_steps');
  if v_since is not null and v_hour between 10 and 20 then
    for x in select a.ref, a.full_name, a.phone, s.code from public.applications a left join public.students s on s.id = a.student_id
              where a.status::text = 'accepted' and a.reviewed_at >= v_since
                and a.reviewed_at < now() - interval '20 hours' and a.reviewed_at > now() - interval '3 days' loop
      perform private.wa_auto('application_next_steps', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), coalesce(x.code, x.ref)), 'application:' || x.ref);
    end loop;
  end if;

  -- The rest are reminders: only in the daytime.
  if v_hour < 10 or v_hour > 20 then return; end if;

  v_since := private.wa_since('application_interview_reminder');
  if v_since is not null then
    for x in select ref, full_name, phone, interview_at from public.applications
              where interview_at between now() + interval '2 hours' and now() + interval '26 hours'
                and interview_set_at >= v_since and status::text not in ('accepted', 'rejected') loop
      perform private.wa_auto('application_interview_reminder', x.phone, x.full_name,
        jsonb_build_array(private.wa_day(x.interview_at), private.wa_time(x.interview_at), private.wa_first(x.full_name)),
        'application:' || x.ref || ':interview:' || to_char(x.interview_at at time zone 'UTC', 'YYYYMMDDHH24MI'));
    end loop;
  end if;

  v_since := private.wa_since('event_reminder');
  if v_since is not null then
    for x in select r.id, r.full_name, r.phone, r.ticket, e.title, e.title_ar, e.starts_at
               from public.event_registrations r join public.site_content e on e.id = r.event_id
              where r.status = 'going' and r.created_at >= v_since
                and e.starts_at between now() + interval '2 hours' and now() + interval '26 hours' loop
      perform private.wa_auto_btn('event_reminder', x.phone, x.full_name,
        jsonb_build_array(coalesce(nullif(x.title_ar, ''), x.title), private.wa_day(x.starts_at), private.wa_time(x.starts_at), private.wa_first(x.full_name)),
        'event:' || x.id, x.ticket);
    end loop;
  end if;

  v_since := private.wa_since('form_session_reminder');
  if v_since is not null then
    for x in select r.id, r.name, r.phone, r.pass, f.title_ar, s ->> 'id' as sid, s ->> 'name' as sname, (s ->> 'at')::timestamptz as at
               from public.forms f
               cross join lateral jsonb_array_elements(private.form_sessions(f.attendance)) s
               join public.form_responses r on r.form_id = f.id
              where coalesce(f.attendance ->> 'on', 'false') = 'true' and not coalesce(f.archived, false)
                and coalesce(s ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}'
                and (s ->> 'at')::timestamptz between now() + interval '2 hours' and now() + interval '26 hours'
                and r.status <> 'rejected' and r.created_at >= v_since
                and (r.status = 'accepted' or not exists (select 1 from public.form_responses y
                                                          where y.form_id = f.id and y.status in ('accepted', 'rejected')))
                and private.form_session_for(f.attendance, s, r.answers) loop
      perform private.wa_auto_btn('form_session_reminder', x.phone, x.name,
        jsonb_build_array(x.title_ar || ' — ' || x.sname, private.wa_day(x.at), private.wa_time(x.at), private.wa_first(x.name)),
        'form:' || x.id || ':session:' || x.sid, lower(x.pass));
    end loop;
  end if;

  -- Thanks and a rating link after an event, to those who were checked in.
  v_since := private.wa_since('event_feedback');
  if v_since is not null then
    for x in select r.id, r.full_name, r.phone, r.ticket, e.title, e.title_ar
               from public.event_registrations r join public.site_content e on e.id = r.event_id
              where r.checked_in_at is not null and r.checked_in_at >= v_since
                and coalesce(e.ends_at, e.starts_at + interval '3 hours') between now() - interval '26 hours' and now() - interval '1 hour'
                and not exists (select 1 from public.event_feedback fb where fb.registration_id = r.id) loop
      perform private.wa_auto_btn('event_feedback', x.phone, x.full_name,
        jsonb_build_array(coalesce(nullif(x.title_ar, ''), x.title), private.wa_first(x.full_name)),
        'event:' || x.id || ':feedback', x.ticket);
    end loop;
  end if;

  v_since := private.wa_since('session_reminder');
  if v_since is not null then
    for x in select se.id as sid, se.title, se.starts_at, st.id, st.full_name, st.phone
               from public.attendance_sessions se
               join public.students st on st.active and st.phone is not null and (se.group_name is null or st.group_name = se.group_name)
              where se.closed_at is null and se.created_at >= v_since
                and se.starts_at between now() + interval '2 hours' and now() + interval '26 hours' loop
      perform private.wa_auto('session_reminder', x.phone, x.full_name,
        jsonb_build_array(x.title, private.wa_day(x.starts_at), private.wa_time(x.starts_at), private.wa_first(x.full_name)),
        'session:' || x.sid || ':' || x.id);
    end loop;
  end if;

  v_since := private.wa_since('membership_expiring');
  if v_since is not null then
    for x in select id, full_name, phone, member_until from public.students
              where active and phone is not null and member_until between current_date and current_date + 7
                and (member_until - 7)::timestamptz >= date_trunc('day', v_since) loop
      perform private.wa_auto('membership_expiring', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), private.wa_day((x.member_until + time '12:00') at time zone 'Africa/Cairo')),
        'member:' || x.id || ':' || x.member_until);
    end loop;
  end if;

  v_since := private.wa_since('loan_overdue');
  if v_since is not null then
    for x in select l.id, l.due_at, i.name as item, st.full_name, st.phone
               from public.inventory_loans l join public.inventory_items i on i.id = l.item_id join public.students st on st.id = l.student_id
              where l.status = 'out' and l.due_at < now() and l.due_at >= v_since loop
      perform private.wa_auto('loan_overdue', x.phone, x.full_name,
        jsonb_build_array(private.wa_first(x.full_name), x.item, private.wa_day(x.due_at)), 'loan:' || x.id);
    end loop;
  end if;
end $$;


select private.wa_templates_submit();
