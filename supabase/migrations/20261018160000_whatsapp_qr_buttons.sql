-- WhatsApp messages that open the person's own QR: accepting a form response with QR attendance sends
-- a button to their attendance QR, booking an event sends a button to their ticket, and the reminders
-- before a session or an event carry the same button.
--
-- A template can have a link button whose end is filled per message (wa_templates.button_url ends in
-- {{1}}); wa_send takes that value, and wa_auto_btn skips a button template when the person has no
-- QR, falling back to the moment's next template.

alter table private.wa_templates add column if not exists button_text text check (char_length(button_text) <= 25);
alter table private.wa_templates add column if not exists button_url text check (button_url ~ '^https://[^ ]+\{\{1\}\}$');
alter table private.wa_templates add column if not exists button_example text;

insert into private.wa_templates (name, category, moments, example, body, button_text, button_url, button_example) values
('bx_form_pass_date_v5', 'UTILITY', '{form_accepted}', '{"Workshop 01 – Embedded Systems","الاثنين 19 أكتوبر","12:30 م"}',
'مبروك 🎉 تم قبولك في «{{1}}» من BuildX HUE.
الموعد: {{2}} الساعة {{3}}
اضغط «الـ QR بتاعي» تحت علشان تفتح كود حضورك، وخليه جاهز على موبايلك وانت داخل.',
 'الـ QR بتاعي', 'https://buildxhue.com/ar/form/?pass={{1}}', 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012'),
('bx_form_pass_v5', 'UTILITY', '{form_accepted}', '{"Workshop 01 – Embedded Systems"}',
'مبروك 🎉 تم قبولك في «{{1}}» من BuildX HUE. اضغط «الـ QR بتاعي» تحت علشان تفتح كود حضورك، وخليه جاهز على موبايلك وانت داخل.',
 'الـ QR بتاعي', 'https://buildxhue.com/ar/form/?pass={{1}}', 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012'),
('bx_form_session_pass_v5', 'UTILITY', '{form_session_reminder}', '{"Workshop 01 — اليوم الأول","الاثنين 19 أكتوبر","12:30 م"}',
'تذكير بموعدك في {{1}} من BuildX HUE يوم {{2}} الساعة {{3}}. افتح الـ QR بتاعك من الزرار تحت علشان تسجيل الحضور.',
 'الـ QR بتاعي', 'https://buildxhue.com/ar/form/?pass={{1}}', 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012'),
('bx_event_ticket_v5', 'UTILITY', '{event_registered,event_promoted}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'تم تأكيد حجزك في {{1}} من BuildX HUE ✅
الموعد: {{2}} الساعة {{3}}
اضغط «تذكرتي» تحت علشان تفتح تذكرتك (QR)، وخليها جاهزة على الباب.',
 'تذكرتي', 'https://buildxhue.com/ar/ticket/?t={{1}}', 'https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D'),
('bx_event_reminder_ticket_v5', 'UTILITY', '{event_reminder}', '{"Arduino Workshop","الاثنين 19 أكتوبر","12:30 م"}',
'تذكير بحجزك في {{1}} من BuildX HUE يوم {{2}} الساعة {{3}}. افتح تذكرتك (QR) من الزرار تحت وخليها جاهزة على الباب.',
 'تذكرتي', 'https://buildxhue.com/ar/ticket/?t={{1}}', 'https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D')
on conflict (name) do update set category = excluded.category, moments = excluded.moments, example = excluded.example, body = excluded.body,
       button_text = excluded.button_text, button_url = excluded.button_url, button_example = excluded.button_example
 where private.wa_templates.meta_id is null;

update private.wa_auto_rules r set template = m.tpl, alts = m.alts, vars_ar = m.vars
  from (values
    ('form_accepted', 'bx_form_pass_date_v5', '{bx_form_pass_v5,bx_form_accepted_date_v5,bx_form_accepted_v5,bx_event_registration_confirmed_v4}'::text[],
     '{{1}} اسم الفورم · {{2}} يوم الفعالية · {{3}} الساعة · زرار بيفتح الـ QR بتاعه لو الفورم فيه «الحضور بالـ QR» — لو مفيش يوم بتتبعت من غير الموعد'),
    ('form_session_reminder', 'bx_form_session_pass_v5', '{bx_form_session_reminder_v5,bx_event_reminder_v4}',
     '{{1}} الفورم والموعد · {{2}} اليوم · {{3}} الساعة · زرار بيفتح الـ QR بتاعه'),
    ('event_registered', 'bx_event_ticket_v5', '{bx_event_booked_v5,bx_event_registration_confirmed_v4}',
     '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · زرار بيفتح تذكرته'),
    ('event_promoted', 'bx_event_ticket_v5', '{bx_event_promoted_v5,bx_event_registration_confirmed_v4}',
     '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · زرار بيفتح تذكرته'),
    ('event_reminder', 'bx_event_reminder_ticket_v5', '{bx_event_reminder_v5,bx_event_reminder_v4}',
     '{{1}} اسم الفعالية · {{2}} اليوم · {{3}} الساعة · زرار بيفتح تذكرته')
  ) as m(key, tpl, alts, vars)
 where r.key = m.key;

-- ───────────────────────────────────────────── sending: the button's value
create or replace function private.wa_send(p_phone text, p_name text, p_text text, p_template text, p_lang text, p_params jsonb, p_context text, p_by uuid, p_button text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  v_id bigint;
  v_req bigint;
  v_name text := coalesce(nullif(btrim(p_name), ''), '');
  v_text text;
  v_body jsonb;
  v_params jsonb;
  v_parts jsonb := '[]'::jsonb;
begin
  select * into a from private.whatsapp_account where id = 1;
  if a.status is distinct from 'ok' then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  if p_template is not null then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'text', 'text', left(private.wa_fill(x, coalesce(nullif(v_name, ''), '-')), 1000))), '[]'::jsonb)
      into v_params from jsonb_array_elements_text(coalesce(p_params, '[]'::jsonb)) x;
    if jsonb_array_length(v_params) > 0 then
      v_parts := v_parts || jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', v_params));
    end if;
    if coalesce(p_button, '') <> '' then
      v_parts := v_parts || jsonb_build_array(jsonb_build_object('type', 'button', 'sub_type', 'url', 'index', '0',
        'parameters', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(p_button, 200)))));
    end if;
    v_body := jsonb_build_object('messaging_product', 'whatsapp', 'to', p_phone, 'type', 'template',
      'template', jsonb_build_object('name', p_template, 'language', jsonb_build_object('code', coalesce(p_lang, 'ar')))
        || case when jsonb_array_length(v_parts) > 0 then jsonb_build_object('components', v_parts) else '{}'::jsonb end);
  else
    v_text := private.wa_fill(p_text, v_name);
    v_body := jsonb_build_object('messaging_product', 'whatsapp', 'recipient_type', 'individual', 'to', p_phone, 'type', 'text',
      'text', jsonb_build_object('preview_url', false, 'body', v_text));
  end if;
  insert into public.whatsapp_messages (to_phone, to_name, kind, body, template, lang, context, created_by)
  values (p_phone, nullif(v_name, ''), case when p_template is null then 'text' else 'template' end,
          case when p_template is null then v_text else (select string_agg(x ->> 'text', ' · ') from jsonb_array_elements(v_params) x) end,
          p_template, case when p_template is null then null else coalesce(p_lang, 'ar') end, p_context, p_by)
  returning id into v_id;
  v_req := net.http_post(
    url := format('https://graph.facebook.com/%s/%s/messages', a.api_version, a.phone_number_id),
    body := v_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || private.wa_token()),
    timeout_milliseconds := 15000);
  update public.whatsapp_messages set request_id = v_req where id = v_id;
  return v_id;
end $$;
revoke all on function private.wa_send(text, text, text, text, text, jsonb, text, uuid, text) from public, anon, authenticated;

create or replace function private.wa_send(p_phone text, p_name text, p_text text, p_template text, p_lang text, p_params jsonb, p_context text, p_by uuid)
returns bigint language sql security definer set search_path = '' as $$
  select private.wa_send(p_phone, p_name, p_text, p_template, p_lang, p_params, p_context, p_by, null::text)
$$;

-- Sends the moment's first template that is approved, has every value filled and, when it has a
-- button, has the person's QR for it. True when the message went (or had already gone).
create or replace function private.wa_auto_btn(p_key text, p_phone text, p_name text, p_params jsonb, p_context text, p_button text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
  v_ctx text := left(coalesce(p_context, ''), 90) || '#' || p_key;
  v_tpls text[];
  v_tpl text;
  v_body text;
  v_params jsonb;
  v_btn boolean;
begin
  if v_phone is null then return false; end if;
  select * into r from private.wa_auto_rules where key = p_key and enabled;
  if not found then return false; end if;
  v_tpls := array_remove(array[r.template] || r.alts, '');
  if cardinality(v_tpls) = 0 then return false; end if;
  if not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then return false; end if;
  if exists (select 1 from public.whatsapp_messages
              where to_phone = v_phone and (context = v_ctx or (context = p_context and template = any (v_tpls)))) then
    return true;
  end if;
  if (select count(*) from public.whatsapp_messages where created_by is null and created_at > now() - interval '1 day') >= 800 then
    return false;
  end if;
  foreach v_tpl in array v_tpls loop
    v_body := null;
    select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
     where a.id = 1 and t ->> 'name' = v_tpl and t ->> 'language' = r.lang limit 1;
    continue when v_body is null;
    v_btn := exists (select 1 from private.wa_templates w where w.name = v_tpl and w.button_url is not null);
    continue when v_btn and coalesce(btrim(p_button), '') = '';
    select coalesce(jsonb_agg(coalesce(p_params -> (i - 1), '"-"'::jsonb) order by i), '[]'::jsonb)
      into v_params from generate_series(1, private.wa_vars(v_body)) i;
    continue when exists (select 1 from jsonb_array_elements_text(v_params) x where btrim(coalesce(x, '')) in ('', '-'));
    perform private.wa_send(v_phone, p_name, null, v_tpl, r.lang, v_params, v_ctx, null, case when v_btn then btrim(p_button) end);
    return true;
  end loop;
  return false;
exception when others then
  return false;
end $$;
revoke all on function private.wa_auto_btn(text, text, text, jsonb, text, text) from public, anon, authenticated;

create or replace function private.wa_auto(p_key text, p_phone text, p_name text, p_params jsonb, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.wa_auto_btn(p_key, p_phone, p_name, p_params, p_context, null);
end $$;

-- ───────────────────────────────────────────── the moments that carry a QR
create or replace function private.form_responses_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  v_next timestamptz;
  v_params jsonb;
begin
  select * into f from public.forms where id = new.form_id;
  if not found or f.delegation is not null then return null; end if;
  v_next := coalesce(private.form_next_session(f.attendance, new.answers), case when f.event_at > now() then f.event_at end);
  v_params := jsonb_build_array(f.title_ar, private.wa_day(v_next), private.wa_time(v_next), private.wa_first(new.name));
  if tg_op = 'INSERT' then
    perform private.wa_auto('form_received', new.phone, new.name, v_params, 'form:' || new.id);
  elsif new.status is distinct from old.status and new.status = 'accepted' then
    perform private.wa_auto_btn('form_accepted', new.phone, new.name, v_params, 'form:' || new.id,
      case when coalesce((f.attendance ->> 'on')::boolean, false) then lower(new.pass) end);
  elsif new.status is distinct from old.status and new.status = 'rejected' then
    perform private.wa_auto('form_rejected', new.phone, new.name, v_params, 'form:' || new.id);
  end if;
  return null;
exception when others then
  return null;
end $$;

create or replace function private.event_registrations_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.site_content;
  v_params jsonb;
begin
  select * into e from public.site_content where id = new.event_id;
  if not found then return null; end if;
  v_params := jsonb_build_array(coalesce(nullif(e.title_ar, ''), e.title), private.wa_day(e.starts_at), private.wa_time(e.starts_at), private.wa_first(new.full_name));
  if tg_op = 'INSERT' then
    if new.status = 'going' then
      perform private.wa_auto_btn('event_registered', new.phone, new.full_name, v_params, 'event:' || new.id, new.ticket);
    elsif new.status = 'waitlist' then
      perform private.wa_auto('event_waitlisted', new.phone, new.full_name, v_params, 'event:' || new.id);
    end if;
  elsif old.status = 'waitlist' and new.status = 'going' then
    perform private.wa_auto_btn('event_promoted', new.phone, new.full_name, v_params, 'event:' || new.id, new.ticket);
  end if;
  return null;
end $$;

-- ───────────────────────────────────────────── reminders carry the ticket or the QR
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

-- ───────────────────────────────────────────── Meta gets the button with the template
create or replace function private.wa_templates_submit()
returns int language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  t private.wa_templates;
  n int := 0;
begin
  select * into a from private.whatsapp_account where id = 1 and status = 'ok' and business_id is not null and token_secret is not null;
  if not found then return 0; end if;
  for t in select * from private.wa_templates
            where meta_id is null and (submit_request is null or submitted_at < now() - interval '10 minutes')
            order by name loop
    update private.wa_templates set meta_error = null, submitted_at = now(), submit_request = net.http_post(
        url := format('https://graph.facebook.com/%s/%s/message_templates', a.api_version, a.business_id),
        body := jsonb_build_object('name', t.name, 'language', t.lang, 'category', t.category,
          'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', t.body)
            || case when cardinality(t.example) > 0
                    then jsonb_build_object('example', jsonb_build_object('body_text', jsonb_build_array(to_jsonb(t.example))))
                    else '{}'::jsonb end)
            || case when t.button_url is not null
                    then jsonb_build_array(jsonb_build_object('type', 'BUTTONS', 'buttons', jsonb_build_array(jsonb_build_object(
                           'type', 'URL', 'text', t.button_text, 'url', t.button_url, 'example', jsonb_build_array(t.button_example)))))
                    else '[]'::jsonb end),
        headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token(), 'Content-Type', 'application/json'),
        timeout_milliseconds := 15000)
     where name = t.name;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.wa_templates_submit() from public, anon, authenticated;

create or replace function public.staff_wa_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'name', w.name, 'lang', w.lang, 'category', coalesce(w.meta_category, w.category), 'body', w.body, 'moments', w.moments,
      'button', w.button_text,
      'status', case when private.wa_approved(w.name, w.lang) then 'APPROVED'
                     when w.meta_status is not null then w.meta_status
                     when w.submit_request is not null then 'SENDING'
                     when w.meta_error is not null then 'ERROR' else 'NEW' end,
      'error', w.meta_error, 'submitted_at', w.submitted_at) order by w.name)
    from private.wa_templates w), '[]'::jsonb);
end $$;

select private.wa_templates_submit();
