-- The person's QR goes out even before Meta approves the button templates, and every template Meta
-- approves is tried on the owner's phone by itself.
--
-- 1. When a moment has the person's QR (attendance pass or event ticket) but its button template is
--    not approved yet, the approved template it falls back to carries the link at the end of its last
--    value: «… — كود حضورك (QR): https://buildxhue.com/ar/form/?pass=…».
-- 2. The 10-minute template job sends each newly approved template once, with its example values, to
--    the number set for the failure alert (wa_templates.tested_at), so the owner sees it on WhatsApp.

alter table private.wa_templates add column if not exists tested_at timestamptz;

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
  v_link text;
  v_label text;
  v_n int;
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
  -- The link the moment's button would open, for a fallback template without a button.
  if coalesce(btrim(p_button), '') <> '' then
    select replace(w.button_url, '{{1}}', btrim(p_button)),
           case when w.button_url like '%/ticket/%' then 'تذكرتك (QR)' else 'كود حضورك (QR)' end
      into v_link, v_label
      from unnest(v_tpls) with ordinality u(c, o) join private.wa_templates w on w.name = u.c
     where w.button_url is not null
     order by u.o limit 1;
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
    v_n := jsonb_array_length(v_params);
    if not v_btn and v_link is not null and v_n > 0 then
      v_params := jsonb_set(v_params, array[(v_n - 1)::text], to_jsonb((v_params ->> (v_n - 1)) || ' — ' || v_label || ': ' || v_link));
    end if;
    perform private.wa_send(v_phone, p_name, null, v_tpl, r.lang, v_params, v_ctx, null, case when v_btn then btrim(p_button) end);
    return true;
  end loop;
  return false;
exception when others then
  return false;
end $$;
revoke all on function private.wa_auto_btn(text, text, text, jsonb, text, text) from public, anon, authenticated;

create or replace function private.wa_templates_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
  c jsonb;
  v_owner text;
begin
  for t in select w.name, h.status_code, h.content, h.error_msg from private.wa_templates w
             join net._http_response h on h.id = w.submit_request loop
    c := case when t.content ~ '^\s*\{' then t.content::jsonb else '{}'::jsonb end;
    if t.status_code between 200 and 299 and c ? 'id' then
      update private.wa_templates set submit_request = null, meta_id = c ->> 'id', meta_status = c ->> 'status',
             meta_category = c ->> 'category', meta_error = null, checked_at = now() where name = t.name;
    else
      update private.wa_templates set submit_request = null, checked_at = now(),
             meta_error = left(coalesce(nullif(concat_ws(' — ', c #>> '{error,error_user_title}', c #>> '{error,error_user_msg}'), ''),
                                        c #>> '{error,message}', t.error_msg, 'HTTP ' || t.status_code), 400)
       where name = t.name;
    end if;
  end loop;
  if exists (select 1 from private.wa_templates where meta_id is not null and coalesce(meta_status, '') not in ('APPROVED', 'REJECTED', 'DISABLED', 'PAUSED')) then
    update private.whatsapp_account set updated_at = now(), templates_request = net.http_get(
        url := format('https://graph.facebook.com/%s/%s/message_templates', api_version, business_id),
        params := jsonb_build_object('fields', 'name,language,status,category,components,rejected_reason', 'limit', '250'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
        timeout_milliseconds := 15000)
     where id = 1 and status = 'ok' and business_id is not null and token_secret is not null and templates_request is null;
  end if;
  -- Each newly approved template, once, to the owner's phone.
  select to_phone into v_owner from private.wa_auto_rules where key = 'send_failed_alert';
  if v_owner is not null and exists (select 1 from private.whatsapp_account where id = 1 and status = 'ok') then
    for t in select w.* from private.wa_templates w where w.tested_at is null and private.wa_approved(w.name, w.lang) order by w.name loop
      perform private.wa_send(v_owner, 'تجربة', null, t.name, t.lang, to_jsonb(t.example), 'test:' || t.name, null,
        case when t.button_url is not null then replace(t.button_example, replace(t.button_url, '{{1}}', ''), '') end);
      update private.wa_templates set tested_at = now() where name = t.name;
    end loop;
  end if;
end $$;
revoke all on function private.wa_templates_tick() from public, anon, authenticated;
