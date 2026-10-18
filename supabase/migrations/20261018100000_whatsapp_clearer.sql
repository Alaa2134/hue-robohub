-- WhatsApp: say what's wrong instead of failing quietly, and fill {hi} on messages sent through Meta.
--
-- * Reading the approved templates can fail (e.g. the business portfolio's ID was typed where the
--   WhatsApp Business Account ID goes, or the system user wasn't given the WhatsApp account). That
--   used to keep the old list silently; now it's kept in templates_error and shown in the app.
-- * The status also returns the latest failed message of the last day (what Meta said and the
--   template), so a broken automatic message is seen in «واتساب» and not only in the log.
-- * Saved messages start with {hi} (a greeting that changes from message to message). Sending on
--   WhatsApp Web filled it; sending through Meta sent «{hi}» as it is. Now both fill it.

alter table private.whatsapp_account add column if not exists templates_error text;

create or replace function private.wa_fill(p_text text, p_name text) returns text
language sql volatile set search_path = '' as $$
  select regexp_replace(
           replace(replace(coalesce(p_text, ''), '{name}', coalesce(nullif(btrim(p_name), ''), '')), '{hi}',
                   (array['أهلًا', 'إزيك', 'أهلًا بيك', 'مساء الخير', 'هاي', 'إزيك عامل إيه'])[1 + floor(random() * 6)::int]),
           '[ \t]{2,}', ' ', 'g')
$$;
revoke execute on function private.wa_fill(text, text) from public, anon, authenticated;

create or replace function private.wa_send(p_phone text, p_name text, p_text text, p_template text, p_lang text, p_params jsonb, p_context text, p_by uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
  v_id bigint;
  v_req bigint;
  v_name text := coalesce(nullif(btrim(p_name), ''), '');
  v_text text;
  v_body jsonb;
  v_params jsonb;
begin
  select * into a from private.whatsapp_account where id = 1;
  if a.status is distinct from 'ok' then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  if p_template is not null then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'text', 'text', left(private.wa_fill(x, coalesce(nullif(v_name, ''), '-')), 1000))), '[]'::jsonb)
      into v_params from jsonb_array_elements_text(coalesce(p_params, '[]'::jsonb)) x;
    v_body := jsonb_build_object('messaging_product', 'whatsapp', 'to', p_phone, 'type', 'template',
      'template', jsonb_build_object('name', p_template, 'language', jsonb_build_object('code', coalesce(p_lang, 'ar')))
        || case when jsonb_array_length(v_params) > 0 then jsonb_build_object('components', jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', v_params))) else '{}'::jsonb end);
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

create or replace function private.wa_reconcile() returns void
language plpgsql security definer set search_path = '' as $$
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
                   'body', (select x ->> 'text' from jsonb_array_elements(t -> 'components') x where x ->> 'type' = 'BODY' limit 1)))
                 from jsonb_array_elements(c -> 'data') t where t ->> 'status' = 'APPROVED'), '[]'::jsonb)
         where id = 1;
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

create or replace function public.staff_whatsapp_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a private.whatsapp_account;
begin
  if not (private.can_read('whatsapp') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.wa_reconcile();
  select * into a from private.whatsapp_account where id = 1;
  return jsonb_build_object(
    'connected', coalesce(a.status = 'ok', false),
    'status', coalesce(a.status, 'none'),
    'phone_number_id', a.phone_number_id, 'business_id', a.business_id,
    'display_phone', a.display_phone, 'verified_name', a.verified_name, 'quality', a.quality,
    'error', a.error, 'checked_at', a.checked_at, 'templates', coalesce(a.templates, '[]'::jsonb),
    'templates_error', case when a.business_id is not null and a.templates_request is null then a.templates_error end,
    'has_token', a.token_secret is not null and a.status <> 'off',
    'sent_today', (select count(*) from public.whatsapp_messages where created_at > date_trunc('day', now()) and status <> 'failed'),
    'failed_today', (select count(*) from public.whatsapp_messages where created_at > date_trunc('day', now()) and status = 'failed'),
    'last_failed', (select jsonb_build_object('error', m.error, 'template', m.template, 'at', m.created_at,
                            'count', (select count(*) from public.whatsapp_messages x where x.status = 'failed' and x.created_at > now() - interval '1 day' and coalesce(x.via, 'api') = 'api'))
                      from public.whatsapp_messages m
                     where m.status = 'failed' and m.created_at > now() - interval '1 day' and coalesce(m.via, 'api') = 'api'
                     order by m.created_at desc limit 1),
    'can_send', private.can('whatsapp'), 'can_connect', private.is_admin());
end $$;

-- Read the template list once more now, so a wrong account ID shows up without reconnecting.
update private.whatsapp_account set templates_request = net.http_get(
    url := format('https://graph.facebook.com/%s/%s/message_templates', api_version, business_id),
    params := jsonb_build_object('fields', 'name,language,status,category,components', 'limit', '200'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
    timeout_milliseconds := 15000)
 where id = 1 and status = 'ok' and business_id is not null and token_secret is not null;
