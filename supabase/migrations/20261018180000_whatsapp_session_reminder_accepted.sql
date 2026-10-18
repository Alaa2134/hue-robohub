-- The reminder before a form's QR-attendance session goes only to accepted people when the form's
-- responses are being reviewed (some accepted or rejected); forms that take everyone remind everyone.

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

