-- WhatsApp under the owner's hand, nothing left that needs a developer:
--   • «ابعت الـ QR بالواتساب» on a form's responses and «ابعت التذاكر» on an event: one tap sends each
--     person their own QR (the button template once Meta approves it, the approved reminder with the link
--     until then), never twice, and says first how many it will reach.
--   • Sending to people from any list fills {link} {code} {pass} {ticket} per person, and a template with a
--     link button gets each person's value.
--   • Templates: write a new one (or fix a refused one) in the app and it goes to Meta; try any approved
--     one on the owner's phone.

-- ───────────────────────────────────────────── the approved list remembers each template's link button
create or replace function private.wa_reconcile()
returns void language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  r record;
  c jsonb;
begin
  select * into a from private.whatsapp_account where id = 1;
  if found and a.status = 'checking' and a.check_request is not null then
    select * into r from net._http_response where id = a.check_request;
    if found then
      c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
      if r.status_code = 200 and c ? 'display_phone_number' then
        update private.whatsapp_account set status = 'ok', display_phone = c ->> 'display_phone_number', verified_name = c ->> 'verified_name',
               quality = c ->> 'quality_rating', error = null, checked_at = now() where id = 1;
      else
        update private.whatsapp_account set status = 'failed', checked_at = now(),
               error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300) where id = 1;
      end if;
    elsif a.updated_at < now() - interval '2 minutes' then
      update private.whatsapp_account set status = 'failed', error = 'Meta did not answer', checked_at = now() where id = 1;
    end if;
  end if;
  if a.id is not null and a.templates_request is not null then
    select * into r from net._http_response where id = a.templates_request;
    if found then
      c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
      if r.status_code = 200 and jsonb_typeof(c -> 'data') = 'array' then
        update private.whatsapp_account set templates_request = null, templates_error = null,
               templates = coalesce((select jsonb_agg(jsonb_build_object(
                   'name', t ->> 'name', 'language', t ->> 'language', 'category', t ->> 'category',
                   'body', (select x ->> 'text' from jsonb_array_elements(t -> 'components') x where x ->> 'type' = 'BODY' limit 1),
                   'button', (select b ->> 'text' from jsonb_array_elements(t -> 'components') x, jsonb_array_elements(x -> 'buttons') b
                               where x ->> 'type' = 'BUTTONS' and b ->> 'type' = 'URL' and b ->> 'url' like '%{{1}}%' limit 1)))
                 from jsonb_array_elements(c -> 'data') t where t ->> 'status' = 'APPROVED'), '[]'::jsonb)
         where id = 1;
        update private.wa_templates w
           set meta_status = t ->> 'status', meta_category = t ->> 'category', meta_id = coalesce(w.meta_id, t ->> 'id'),
               meta_error = case when t ->> 'status' = 'REJECTED' then left(coalesce(nullif(t ->> 'rejected_reason', 'NONE'), 'REJECTED'), 400) end,
               checked_at = now()
          from jsonb_array_elements(c -> 'data') t
         where t ->> 'name' = w.name and t ->> 'language' = w.lang;
      else
        update private.whatsapp_account set templates_request = null,
               templates_error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300)
         where id = 1;
      end if;
    elsif a.updated_at < now() - interval '2 minutes' then
      update private.whatsapp_account set templates_request = null, templates_error = 'Meta did not answer' where id = 1;
    end if;
  end if;
  for r in select m.id, h.status_code, h.content, h.error_msg from public.whatsapp_messages m
             join net._http_response h on h.id = m.request_id
            where m.status = 'queued' loop
    c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
    if r.status_code between 200 and 299 and c #>> '{messages,0,id}' is not null then
      update public.whatsapp_messages set status = 'sent', wa_id = c #>> '{messages,0,id}', sent_at = now() where id = r.id;
    else
      update public.whatsapp_messages set status = 'failed',
             error = left(coalesce(c #>> '{error,message}', r.error_msg, 'HTTP ' || r.status_code), 300) where id = r.id;
    end if;
  end loop;
  update public.whatsapp_messages set status = 'failed', error = 'no answer from Meta'
   where status = 'queued' and created_at < now() - interval '10 minutes';
end $$;

-- A template has a link button whose end is filled per message.
create or replace function private.wa_has_button(p_template text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from private.wa_templates w where w.name = p_template and w.button_url is not null)
      or exists (select 1 from private.whatsapp_account a, jsonb_array_elements(a.templates) t
                  where a.id = 1 and t ->> 'name' = p_template and coalesce(t ->> 'button', '') <> '')
$$;

-- {link} {code} {pass} {ticket} → this person's values.
create or replace function private.wa_fill_vars(p_text text, p_vars jsonb)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(p_text, ''),
           '{link}', coalesce(p_vars ->> 'link', '')), '{code}', coalesce(p_vars ->> 'code', '')),
           '{pass}', coalesce(p_vars ->> 'pass', '')), '{ticket}', coalesce(p_vars ->> 'ticket', ''))
$$;

-- The text asks for one of them that this person does not have.
create or replace function private.wa_vars_missing(p_text text, p_vars jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from unnest(array['link', 'code', 'pass', 'ticket']) v
                  where position('{' || v || '}' in coalesce(p_text, '')) > 0 and btrim(coalesce(p_vars ->> v, '')) = '')
$$;

-- ───────────────────────────────────────────── the first approved template that fits, with the QR link
-- Shared by the automatic moments and the one-tap sends: the first of p_tpls that is approved, has every
-- value filled and, when it has a button, gets the person's QR for it; a fallback without a button
-- carries the link at the end of its last value. Returns the template sent, or null.
create or replace function private.wa_send_best(p_phone text, p_name text, p_tpls text[], p_lang text, p_params jsonb, p_ctx text, p_button text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_tpl text;
  v_body text;
  v_params jsonb;
  v_btn boolean;
  v_link text;
  v_label text;
  v_n int;
begin
  if coalesce(btrim(p_button), '') <> '' then
    select replace(w.button_url, '{{1}}', btrim(p_button)),
           case when w.button_url like '%/ticket/%' then 'تذكرتك (QR)' else 'كود حضورك (QR)' end
      into v_link, v_label
      from unnest(p_tpls) with ordinality u(c, o) join private.wa_templates w on w.name = u.c
     where w.button_url is not null
     order by u.o limit 1;
  end if;
  foreach v_tpl in array p_tpls loop
    v_body := null;
    select t ->> 'body' into v_body from private.whatsapp_account a, jsonb_array_elements(a.templates) t
     where a.id = 1 and t ->> 'name' = v_tpl and t ->> 'language' = p_lang limit 1;
    continue when v_body is null;
    v_btn := private.wa_has_button(v_tpl);
    continue when v_btn and coalesce(btrim(p_button), '') = '';
    select coalesce(jsonb_agg(coalesce(p_params -> (i - 1), '"-"'::jsonb) order by i), '[]'::jsonb)
      into v_params from generate_series(1, private.wa_vars(v_body)) i;
    continue when exists (select 1 from jsonb_array_elements_text(v_params) x where btrim(coalesce(x, '')) in ('', '-'));
    v_n := jsonb_array_length(v_params);
    if not v_btn and v_link is not null and v_n > 0 then
      v_params := jsonb_set(v_params, array[(v_n - 1)::text], to_jsonb((v_params ->> (v_n - 1)) || ' — ' || v_label || ': ' || v_link));
    end if;
    perform private.wa_send(p_phone, p_name, null, v_tpl, p_lang, v_params, p_ctx, null, case when v_btn then btrim(p_button) end);
    return v_tpl;
  end loop;
  return null;
end $$;
revoke all on function private.wa_send_best(text, text, text[], text, jsonb, text, text) from public, anon, authenticated;

create or replace function private.wa_auto_btn(p_key text, p_phone text, p_name text, p_params jsonb, p_context text, p_button text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r private.wa_auto_rules;
  v_phone text := private.wa_phone(p_phone);
  v_ctx text := left(coalesce(p_context, ''), 90) || '#' || p_key;
  v_tpls text[];
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
  return private.wa_send_best(v_phone, p_name, v_tpls, r.lang, p_params, v_ctx, p_button) is not null;
exception when others then
  return false;
end $$;
revoke all on function private.wa_auto_btn(text, text, text, jsonb, text, text) from public, anon, authenticated;

-- ───────────────────────────────────────────── one tap: each accepted person's QR for a form
create or replace function public.staff_form_send_passes(p_form uuid, p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  x record;
  v_next timestamptz;
  v_phone text;
  v_ctx text;
  v_sent int := 0;
  v_ready int := 0;
  v_done int := 0;
  v_nophone int := 0;
  v_fail int := 0;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into f from public.forms where id = p_form;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if coalesce(f.attendance ->> 'on', 'false') <> 'true' then
    raise exception 'no_attendance' using errcode = 'P0001';
  end if;
  if not p_dry and not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  for x in select r.id, r.name, r.phone, r.pass, r.answers from public.form_responses r
            where r.form_id = f.id and r.status = 'accepted' and r.pass is not null order by r.accepted_at nulls last loop
    v_phone := private.wa_phone(x.phone);
    if v_phone is null then
      v_nophone := v_nophone + 1;
      continue;
    end if;
    if exists (select 1 from public.whatsapp_messages m
                where m.to_phone = v_phone and m.context like 'form:' || x.id || '%' and m.status <> 'failed'
                  and (m.body like '%?pass=%' or private.wa_has_button(m.template))) then
      v_done := v_done + 1;
      continue;
    end if;
    v_ready := v_ready + 1;
    continue when p_dry;
    v_next := coalesce(private.form_next_session(f.attendance, x.answers), case when f.event_at > now() then f.event_at end);
    v_ctx := 'form:' || x.id || ':pass#form_pass';
    if private.wa_send_best(v_phone, x.name,
         array['bx_form_pass_date_v5', 'bx_form_pass_v5', 'bx_event_reminder_v4', 'bx_event_registration_confirmed_v4'], 'ar',
         jsonb_build_array(f.title_ar, private.wa_day(v_next), private.wa_time(v_next)), v_ctx, lower(x.pass)) is null then
      v_fail := v_fail + 1;
    else
      v_sent := v_sent + 1;
    end if;
  end loop;
  return jsonb_build_object('ready', v_ready, 'sent', v_sent, 'already', v_done, 'no_phone', v_nophone, 'no_template', v_fail);
end $$;
revoke all on function public.staff_form_send_passes(uuid, boolean) from public, anon;
grant execute on function public.staff_form_send_passes(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────── one tap: each booking's ticket for an event
create or replace function public.staff_event_send_tickets(p_event uuid, p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.site_content;
  x record;
  v_phone text;
  v_sent int := 0;
  v_ready int := 0;
  v_done int := 0;
  v_nophone int := 0;
  v_fail int := 0;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into e from public.site_content where id = p_event and kind::text = 'event';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not p_dry and not exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  for x in select r.id, r.full_name, r.phone, r.ticket from public.event_registrations r
            where r.event_id = e.id and r.status = 'going' order by r.created_at loop
    v_phone := private.wa_phone(x.phone);
    if v_phone is null then
      v_nophone := v_nophone + 1;
      continue;
    end if;
    if exists (select 1 from public.whatsapp_messages m
                where m.to_phone = v_phone and m.context like 'event:' || x.id || '%' and m.status <> 'failed'
                  and (m.body like '%/ticket/?t=%' or private.wa_has_button(m.template))) then
      v_done := v_done + 1;
      continue;
    end if;
    v_ready := v_ready + 1;
    continue when p_dry;
    if private.wa_send_best(v_phone, x.full_name,
         array['bx_event_ticket_v5', 'bx_event_booked_v5', 'bx_event_reminder_v4', 'bx_event_registration_confirmed_v4'], 'ar',
         jsonb_build_array(coalesce(nullif(e.title_ar, ''), e.title), private.wa_day(e.starts_at), private.wa_time(e.starts_at)),
         'event:' || x.id || ':ticket#event_ticket', x.ticket) is null then
      v_fail := v_fail + 1;
    else
      v_sent := v_sent + 1;
    end if;
  end loop;
  return jsonb_build_object('ready', v_ready, 'sent', v_sent, 'already', v_done, 'no_phone', v_nophone, 'no_template', v_fail);
end $$;
revoke all on function public.staff_event_send_tickets(uuid, boolean) from public, anon;
grant execute on function public.staff_event_send_tickets(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────── sending to people: their own link, code and button
create or replace function public.staff_whatsapp_send(p_people jsonb, p_text text default null, p_template text default null, p_lang text default 'ar',
                                                      p_params jsonb default '[]'::jsonb, p_context text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p jsonb;
  v_phone text;
  v_seen text[] := '{}';
  v_bad int := 0;
  v_n int := 0;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_tpl text := nullif(btrim(coalesce(p_template, '')), '');
  v_btn boolean;
  v_params jsonb;
  v_button text;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (v_text is null) = (v_tpl is null) or char_length(coalesce(v_text, '')) > 4096
     or (v_tpl is not null and (char_length(v_tpl) > 512 or v_tpl !~ '^[a-z0-9_]+$')) or coalesce(p_lang, 'ar') !~ '^[a-z]{2,3}(_[A-Z]{2})?$'
     or jsonb_typeof(coalesce(p_params, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_params, '[]'::jsonb)) > 10
     or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if jsonb_array_length(p_people) > 300 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  if (select count(*) from public.whatsapp_messages where created_at > now() - interval '1 day') + jsonb_array_length(p_people) > 1000 then
    raise exception 'daily_limit' using errcode = '22023';
  end if;
  v_btn := v_tpl is not null and private.wa_has_button(v_tpl);
  for p in select * from jsonb_array_elements(p_people) loop
    v_phone := private.wa_phone(p ->> 'phone');
    if v_phone is null or v_phone = any(v_seen) then
      v_bad := v_bad + 1;
      continue;
    end if;
    -- Someone without a value the message asks for (their link, code, QR) is skipped, not sent half.
    if private.wa_vars_missing(concat_ws(' ', v_text, p_params::text, case when v_btn then p ->> 'button' end), p -> 'vars') then
      v_bad := v_bad + 1;
      continue;
    end if;
    select coalesce(jsonb_agg(to_jsonb(private.wa_fill_vars(x, p -> 'vars')) order by o), '[]'::jsonb)
      into v_params from jsonb_array_elements_text(coalesce(p_params, '[]'::jsonb)) with ordinality e(x, o);
    v_button := nullif(btrim(private.wa_fill_vars(p ->> 'button', p -> 'vars')), '');
    if (v_btn and v_button is null) or exists (select 1 from jsonb_array_elements_text(v_params) x where btrim(x) = '') then
      v_bad := v_bad + 1;
      continue;
    end if;
    v_seen := v_seen || v_phone;
    perform private.wa_send(v_phone, left(p ->> 'name', 120), case when v_text is not null then private.wa_fill_vars(v_text, p -> 'vars') end,
                            v_tpl, coalesce(p_lang, 'ar'), v_params, left(p_context, 120), auth.uid(), case when v_btn then v_button end);
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'whatsapp_send', 'whatsapp', p_context,
          jsonb_build_object('count', v_n, 'template', v_tpl));
  return jsonb_build_object('queued', v_n, 'skipped', v_bad);
end $$;

-- ───────────────────────────────────────────── templates from the app
create or replace function public.staff_wa_template_test(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w private.wa_templates;
  v_owner text;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into w from private.wa_templates where name = p_name;
  if not found or not private.wa_approved(p_name, w.lang) then
    raise exception 'unknown_template' using errcode = 'P0001';
  end if;
  select to_phone into v_owner from private.wa_auto_rules where key = 'send_failed_alert';
  if v_owner is null then
    raise exception 'no_phone' using errcode = 'P0001';
  end if;
  perform private.wa_send(v_owner, 'تجربة', null, w.name, w.lang, to_jsonb(w.example), 'test:' || w.name, auth.uid(),
    case when w.button_url is not null then replace(w.button_example, replace(w.button_url, '{{1}}', ''), '') end);
end $$;
revoke all on function public.staff_wa_template_test(text) from public, anon;
grant execute on function public.staff_wa_template_test(text) to authenticated;

-- Write a template (or a fixed version of a refused one) and send it to Meta. A fixed version takes the
-- old one's place in every moment; a new one can be made a moment's preferred template (its current
-- template stays as the fallback until Meta approves).
create or replace function public.staff_wa_template_save(p_body text, p_category text, p_examples text[], p_button text default null,
                                                        p_moment text default null, p_replaces text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_nums int[];
  v_n int;
  v_name text;
  v_old private.wa_templates;
  v_url text;
  v_text text;
  v_example text;
begin
  if not private.can('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) < 10 or char_length(v_body) > 1024 then
    raise exception 'template_length' using errcode = 'P0001';
  end if;
  if v_body ~ '^\{\{\d+\}\}' or v_body ~ '\{\{\d+\}\}[[:space:][:punct:]]*$' then
    raise exception 'template_edges' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct m[1]::int order by m[1]::int), '{}') into v_nums from regexp_matches(v_body, '\{\{(\d+)\}\}', 'g') m;
  v_n := cardinality(v_nums);
  if v_n > 0 and v_nums <> (select array_agg(i order by i) from generate_series(1, v_n) i) then
    raise exception 'template_vars' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_examples, '{}')) <> v_n or exists (select 1 from unnest(coalesce(p_examples, '{}')) x where btrim(x) = '') then
    raise exception 'template_examples' using errcode = 'P0001';
  end if;
  if coalesce(p_category, '') not in ('UTILITY', 'MARKETING') or coalesce(p_button, 'none') not in ('none', 'pass', 'ticket') then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if p_replaces is not null then
    select * into v_old from private.wa_templates where name = p_replaces;
    if not found then
      raise exception 'unknown_template' using errcode = 'P0001';
    end if;
  end if;
  v_name := 'bx_' || coalesce(nullif(regexp_replace(regexp_replace(coalesce(p_replaces, ''), '^bx_', ''), '_(v\d+|r\d+|\d{8,})$', ''), ''), 'custom')
            || '_' || to_char(now() at time zone 'UTC', 'YYMMDDHH24MISS');
  if p_button = 'pass' then
    v_url := 'https://buildxhue.com/ar/form/?pass={{1}}'; v_text := 'الـ QR بتاعي'; v_example := 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012';
  elsif p_button = 'ticket' then
    v_url := 'https://buildxhue.com/ar/ticket/?t={{1}}'; v_text := 'تذكرتي'; v_example := 'https://buildxhue.com/ar/ticket/?t=BXT-1A2B3C4D';
  end if;
  insert into private.wa_templates (name, category, body, example, moments, button_text, button_url, button_example)
  values (v_name, p_category, v_body, coalesce(p_examples, '{}'), coalesce(v_old.moments, case when p_moment is not null then array[p_moment] else '{}' end),
          v_text, v_url, v_example);
  if p_replaces is not null then
    update private.wa_auto_rules set template = v_name where template = p_replaces;
    update private.wa_auto_rules set alts = array_replace(alts, p_replaces, v_name) where p_replaces = any (alts);
    update private.wa_templates set moments = '{}' where name = p_replaces;
  end if;
  if p_moment is not null then
    update private.wa_auto_rules
       set alts = array_remove(array[template] || array_remove(alts, v_name), v_name), template = v_name
     where key = p_moment and template <> v_name;
  end if;
  perform private.wa_templates_submit();
  return v_name;
end $$;
revoke all on function public.staff_wa_template_save(text, text, text[], text, text, text) from public, anon;
grant execute on function public.staff_wa_template_save(text, text, text[], text, text, text) to authenticated;

create or replace function public.staff_wa_templates()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'name', w.name, 'lang', w.lang, 'category', coalesce(w.meta_category, w.category), 'body', w.body, 'moments', w.moments,
      'example', w.example, 'button', w.button_text,
      'button_kind', case when w.button_url like '%/ticket/%' then 'ticket' when w.button_url like '%pass=%' then 'pass' end,
      'status', case when private.wa_approved(w.name, w.lang) then 'APPROVED'
                     when w.meta_status is not null then w.meta_status
                     when w.submit_request is not null then 'SENDING'
                     when w.meta_error is not null then 'ERROR' else 'NEW' end,
      'error', w.meta_error, 'submitted_at', w.submitted_at, 'tested_at', w.tested_at) order by w.name)
    from private.wa_templates w), '[]'::jsonb);
end $$;

-- Read the approved list now so it carries the buttons.
update private.whatsapp_account set updated_at = now(), templates_request = net.http_get(
    url := format('https://graph.facebook.com/%s/%s/message_templates', api_version, business_id),
    params := jsonb_build_object('fields', 'name,language,status,category,components,rejected_reason', 'limit', '250'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
    timeout_milliseconds := 15000)
 where id = 1 and status = 'ok' and business_id is not null and token_secret is not null and templates_request is null;
