-- WhatsApp (Meta's WhatsApp Cloud API), connected from the app.
--  * The owner (or a full admin) pastes the number's "Phone number ID", the business account ID and an
--    access token in «واتساب». The token goes into Supabase Vault (encrypted) and never comes back out to
--    any screen: the database itself sends the messages (pg_net), with the token added on its way out.
--  * Saving checks the number with Meta right away (name and number shown once it answers) and, with the
--    business account ID, loads the approved message templates.
--  * Whoever has the "whatsapp" area sends: a free message (reaches people who wrote to the number in the
--    last 24 hours) or an approved template (anyone), to typed numbers, a delegation or a group of
--    students. "{name}" becomes each person's name. "whatsapp:view" sees the message log.
--  * At most 300 numbers per send and 1000 messages a day; every send is in the log and the activity log.

create table if not exists private.whatsapp_account (
  id int primary key default 1 check (id = 1),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,30}$'),
  business_id text check (business_id is null or business_id ~ '^[0-9]{5,30}$'),
  token_secret uuid,
  api_version text not null default 'v21.0' check (api_version ~ '^v[0-9]{1,2}\.[0-9]$'),
  status text not null default 'checking' check (status in ('checking', 'ok', 'failed', 'off')),
  display_phone text,
  verified_name text,
  quality text,
  check_request bigint,
  templates_request bigint,
  templates jsonb not null default '[]',
  error text,
  checked_at timestamptz,
  connected_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on private.whatsapp_account from public, anon, authenticated;

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  to_phone text not null check (to_phone ~ '^[1-9][0-9]{7,14}$'),
  to_name text check (to_name is null or char_length(to_name) <= 120),
  kind text not null check (kind in ('text', 'template')),
  body text check (body is null or char_length(body) <= 4096),
  template text check (template is null or (char_length(template) <= 512 and template ~ '^[a-z0-9_]+$')),
  lang text,
  context text check (context is null or char_length(context) <= 120),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  request_id bigint,
  wa_id text,
  error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index if not exists whatsapp_messages_queued_idx on public.whatsapp_messages (request_id) where status = 'queued';
alter table public.whatsapp_messages enable row level security;
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated
  using ((select private.can_read('whatsapp')));
revoke all on public.whatsapp_messages from anon;
grant select on public.whatsapp_messages to authenticated;

/** The token, for the database's own requests to Meta only. */
create or replace function private.wa_token() returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.id = (select token_secret from private.whatsapp_account where id = 1)
$$;
revoke execute on function private.wa_token() from public, anon, authenticated;

/** A phone number as WhatsApp wants it (country code, digits only); Egyptian 01… numbers get 20. */
create or replace function private.wa_phone(p text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d like '00%' then d := substr(d, 3); end if;
  if d ~ '^01[0-9]{9}$' then d := '2' || d; end if;
  if d ~ '^1[0-9]{9}$' then d := '20' || d; end if;
  return case when d ~ '^[1-9][0-9]{7,14}$' then d end;
end $$;
revoke execute on function private.wa_phone(text) from public, anon;
grant execute on function private.wa_phone(text) to authenticated;

/** Sends one message through Meta (the answer is read later by private.wa_reconcile). */
create or replace function private.wa_send(p_phone text, p_name text, p_text text, p_template text, p_lang text, p_params jsonb, p_context text, p_by uuid)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  a private.whatsapp_account;
  v_id bigint;
  v_req bigint;
  v_name text := coalesce(nullif(btrim(p_name), ''), '');
  v_body jsonb;
  v_params jsonb;
begin
  select * into a from private.whatsapp_account where id = 1;
  if a.status is distinct from 'ok' then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  if p_template is not null then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'text', 'text', left(replace(x, '{name}', coalesce(nullif(v_name, ''), '-')), 1000))), '[]'::jsonb)
      into v_params from jsonb_array_elements_text(coalesce(p_params, '[]'::jsonb)) x;
    v_body := jsonb_build_object('messaging_product', 'whatsapp', 'to', p_phone, 'type', 'template',
      'template', jsonb_build_object('name', p_template, 'language', jsonb_build_object('code', coalesce(p_lang, 'ar')))
        || case when jsonb_array_length(v_params) > 0 then jsonb_build_object('components', jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', v_params))) else '{}'::jsonb end);
  else
    v_body := jsonb_build_object('messaging_product', 'whatsapp', 'recipient_type', 'individual', 'to', p_phone, 'type', 'text',
      'text', jsonb_build_object('preview_url', false, 'body', replace(p_text, '{name}', coalesce(nullif(v_name, ''), ''))));
  end if;
  insert into public.whatsapp_messages (to_phone, to_name, kind, body, template, lang, context, created_by)
  values (p_phone, nullif(v_name, ''), case when p_template is null then 'text' else 'template' end,
          case when p_template is null then replace(p_text, '{name}', v_name) else (select string_agg(x ->> 'text', ' · ') from jsonb_array_elements(v_params) x) end,
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
revoke execute on function private.wa_send(text, text, text, text, text, jsonb, text, uuid) from public, anon, authenticated;

/** Reads Meta's answers: the number check, the templates, and each message (sent with its id, or why not). */
create or replace function private.wa_reconcile() returns void
language plpgsql security definer set search_path = ''
as $$
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
  if found and a.templates_request is not null then
    select * into r from net._http_response where id = a.templates_request;
    if found then
      c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
      update private.whatsapp_account set templates_request = null,
             templates = coalesce((select jsonb_agg(jsonb_build_object(
                 'name', t ->> 'name', 'language', t ->> 'language', 'category', t ->> 'category',
                 'body', (select x ->> 'text' from jsonb_array_elements(t -> 'components') x where x ->> 'type' = 'BODY' limit 1)))
               from jsonb_array_elements(c -> 'data') t where t ->> 'status' = 'APPROVED'), templates)
       where id = 1;
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
  -- No answer after 10 minutes: count it as failed (pg_net keeps answers for a few hours).
  update public.whatsapp_messages set status = 'failed', error = 'no answer from Meta'
   where status = 'queued' and created_at < now() - interval '10 minutes';
end $$;
revoke execute on function private.wa_reconcile() from public, anon, authenticated;

/** Owner / full admin: connect (or change) the WhatsApp number. The token is stored in Vault only. */
create or replace function public.staff_whatsapp_connect(p_phone_number_id text, p_token text, p_business_id text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a private.whatsapp_account;
  v_secret uuid;
  v_phone text := btrim(coalesce(p_phone_number_id, ''));
  v_biz text := nullif(btrim(coalesce(p_business_id, '')), '');
  v_token text := btrim(coalesce(p_token, ''));
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_phone !~ '^[0-9]{5,30}$' or (v_biz is not null and v_biz !~ '^[0-9]{5,30}$') then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  select * into a from private.whatsapp_account where id = 1;
  if v_token = '' then
    -- Same token, other number or business account.
    if a.token_secret is null or a.status = 'off' then
      raise exception 'token_required' using errcode = '22023';
    end if;
    v_secret := a.token_secret;
  elsif char_length(v_token) not between 40 and 1024 or v_token !~ '^[A-Za-z0-9_.|-]+$' then
    raise exception 'invalid_token' using errcode = '22023';
  elsif a.token_secret is not null then
    perform vault.update_secret(a.token_secret, v_token);
    v_secret := a.token_secret;
  else
    v_secret := vault.create_secret(v_token, 'whatsapp_cloud_token', 'WhatsApp Cloud API access token (BuildX App)');
  end if;
  insert into private.whatsapp_account (id, phone_number_id, business_id, token_secret, status, connected_by, updated_at, error)
  values (1, v_phone, v_biz, v_secret, 'checking', auth.uid(), now(), null)
  on conflict (id) do update set phone_number_id = excluded.phone_number_id, business_id = excluded.business_id,
    token_secret = excluded.token_secret, status = 'checking', connected_by = excluded.connected_by, updated_at = now(),
    error = null, display_phone = null, verified_name = null;
  select * into a from private.whatsapp_account where id = 1;
  update private.whatsapp_account set check_request = net.http_get(
      url := format('https://graph.facebook.com/%s/%s', a.api_version, a.phone_number_id),
      params := jsonb_build_object('fields', 'display_phone_number,verified_name,quality_rating'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
      timeout_milliseconds := 15000),
    templates_request = case when a.business_id is null then null else net.http_get(
      url := format('https://graph.facebook.com/%s/%s/message_templates', a.api_version, a.business_id),
      params := jsonb_build_object('fields', 'name,language,status,category,components', 'limit', '200'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || private.wa_token()),
      timeout_milliseconds := 15000) end
   where id = 1;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'whatsapp_connect', 'whatsapp', v_phone,
          jsonb_build_object('business_id', v_biz, 'new_token', v_token <> ''));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.staff_whatsapp_connect(text, text, text) from public, anon;
grant execute on function public.staff_whatsapp_connect(text, text, text) to authenticated;

/** Owner / full admin: stop sending (the token is overwritten in Vault). */
create or replace function public.staff_whatsapp_disconnect() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret uuid := (select token_secret from private.whatsapp_account where id = 1);
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_secret is not null then
    perform vault.update_secret(v_secret, 'disconnected');
  end if;
  update private.whatsapp_account set status = 'off', templates = '[]', updated_at = now() where id = 1;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'whatsapp_disconnect', 'whatsapp', null, '{}'::jsonb);
end $$;
revoke execute on function public.staff_whatsapp_disconnect() from public, anon;
grant execute on function public.staff_whatsapp_disconnect() to authenticated;

/** The connection as the app shows it (never the token), with today's numbers. */
create or replace function public.staff_whatsapp_status() returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
    'has_token', a.token_secret is not null and a.status <> 'off',
    'sent_today', (select count(*) from public.whatsapp_messages where created_at > date_trunc('day', now()) and status <> 'failed'),
    'failed_today', (select count(*) from public.whatsapp_messages where created_at > date_trunc('day', now()) and status = 'failed'),
    'can_send', private.can('whatsapp'), 'can_connect', private.is_admin());
end $$;
revoke execute on function public.staff_whatsapp_status() from public, anon;
grant execute on function public.staff_whatsapp_status() to authenticated;

/**
 * Send to a list of people: [{phone, name}]. A free message (p_text) or an approved template (p_template,
 * its language and the values for its {{1}}, {{2}}…). "{name}" becomes each person's name.
 */
create or replace function public.staff_whatsapp_send(p_people jsonb, p_text text default null, p_template text default null,
  p_lang text default 'ar', p_params jsonb default '[]', p_context text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p jsonb;
  v_phone text;
  v_seen text[] := '{}';
  v_bad int := 0;
  v_n int := 0;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_tpl text := nullif(btrim(coalesce(p_template, '')), '');
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
  for p in select * from jsonb_array_elements(p_people) loop
    v_phone := private.wa_phone(p ->> 'phone');
    if v_phone is null or v_phone = any(v_seen) then
      v_bad := v_bad + 1;
      continue;
    end if;
    v_seen := v_seen || v_phone;
    perform private.wa_send(v_phone, left(p ->> 'name', 120), v_text, v_tpl, coalesce(p_lang, 'ar'), p_params, left(p_context, 120), auth.uid());
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'whatsapp_send', 'whatsapp', p_context,
          jsonb_build_object('count', v_n, 'template', v_tpl));
  return jsonb_build_object('queued', v_n, 'skipped', v_bad);
end $$;
revoke execute on function public.staff_whatsapp_send(jsonb, text, text, text, jsonb, text) from public, anon;
grant execute on function public.staff_whatsapp_send(jsonb, text, text, text, jsonb, text) to authenticated;

-- Meta's answers are read every two minutes (and whenever someone opens the screen).
select cron.schedule('whatsapp-reconcile', '*/2 * * * *', $$select private.wa_reconcile()$$);
