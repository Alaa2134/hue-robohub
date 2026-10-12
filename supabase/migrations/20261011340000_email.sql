-- Email, sent by the database through Resend (resend.com), like WhatsApp:
--  * The owner (or a full admin) pastes a Resend API key and the sender address in «الإيميل». The key goes
--    into Supabase Vault (encrypted) and never comes back to any screen; the database sends (pg_net) and
--    adds the key on the way out. Saving checks the key with Resend and lists the domains it can send from.
--  * Whoever has the new "email" area sends to a list of people ({name} becomes each one's name), edits the
--    automatic emails and sees the log; "email:view" sees the log and the automatic emails.
--  * Automatic emails (each one can be turned off and reworded in the app): an application received,
--    accepted or not accepted, a family sign-up, a message from the contact page, an event ticket.
--    An automatic email never stops the form it follows: if email isn't connected or anything fails, the
--    sign-up goes through as before.
--  * Every bulk email has an unsubscribe link (buildxhue.com/unsubscribe); someone who unsubscribed gets
--    nothing again. At most 300 people per send and the daily limit set on the account (Resend's free plan
--    is 100 a day).

-- ─────────────────────────────────────────────────────────────── the "email" area
create or replace function private.valid_permissions(p text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null or (cardinality(p) <= 80 and not exists (
    select 1 from unnest(p) e
     where e !~ '^(applications|students|events|content|inbox|certificates|publish|settings|portfolios|notify|security|roster|attendance|quizzes|tasks|materials|announcements|points|site|pages|forms|expo|sectors|inventory|voice|whatsapp|email)(:view)?$'))
$$;
revoke execute on function private.valid_permissions(text[]) from public, anon, authenticated;

-- Whoever sends WhatsApp messages can send email too (the same job).
update public.staff set permissions = permissions || array['email']
 where permissions is not null and 'whatsapp' = any(permissions) and not 'email' = any(permissions);
update public.staff set permissions = permissions || array['email:view']
 where permissions is not null and 'whatsapp:view' = any(permissions) and not 'email:view' = any(permissions)
   and not 'email' = any(permissions);

-- ─────────────────────────────────────────────────────────────── tables
create table if not exists private.email_account (
  id int primary key default 1 check (id = 1),
  key_secret uuid,
  from_email text not null check (from_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(from_email) <= 200),
  from_name text not null default 'BuildX HUE' check (char_length(from_name) between 1 and 80 and from_name !~ '[<>"\r\n]'),
  reply_to text check (reply_to is null or (reply_to ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(reply_to) <= 200)),
  daily_limit int not null default 100 check (daily_limit between 1 and 50000),
  status text not null default 'checking' check (status in ('checking', 'ok', 'failed', 'off')),
  domains jsonb,
  check_request bigint,
  error text,
  checked_at timestamptz,
  connected_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on private.email_account from public, anon, authenticated;

-- The secret behind every unsubscribe link (made once, kept in Vault).
create table if not exists private.email_keys (
  id int primary key default 1 check (id = 1),
  unsub_secret uuid not null
);
revoke all on private.email_keys from public, anon, authenticated;
insert into private.email_keys (id, unsub_secret)
select 1, vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_unsubscribe_key', 'Signs the unsubscribe links in emails (BuildX App)')
 where not exists (select 1 from private.email_keys);

create table if not exists public.email_messages (
  id bigint generated always as identity primary key,
  to_email text not null check (char_length(to_email) <= 254),
  to_name text check (to_name is null or char_length(to_name) <= 120),
  subject text not null check (char_length(subject) <= 200),
  body text check (body is null or char_length(body) <= 20000),
  kind text not null check (kind in ('manual', 'auto', 'test')),
  template text check (template is null or template ~ '^[a-z_]{2,40}$'),
  context text check (context is null or char_length(context) <= 120),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  request_id bigint,
  provider_id text,
  error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_messages_created_idx on public.email_messages (created_at desc);
create index if not exists email_messages_queued_idx on public.email_messages (request_id) where status = 'queued';
alter table public.email_messages enable row level security;
create policy email_messages_select on public.email_messages for select to authenticated
  using ((select private.can_read('email')));
revoke all on public.email_messages from anon;
grant select on public.email_messages to authenticated;

create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email) and char_length(email) <= 254),
  reason text not null default 'unsubscribed' check (reason in ('unsubscribed', 'bounced', 'staff')),
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
create policy email_suppressions_select on public.email_suppressions for select to authenticated
  using ((select private.can_read('email')));
revoke all on public.email_suppressions from anon;
grant select on public.email_suppressions to authenticated;

-- The automatic emails: on/off and their words. {name} and the other {…} are filled in for each person;
-- a line whose {…} has nothing to fill in is left out.
create table if not exists private.email_templates (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  enabled boolean not null default true,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on private.email_templates from public, anon, authenticated;

insert into private.email_templates (key, enabled, subject, body) values
('application_received', true, 'وصلنا طلبك يا {name} 🎉',
$t$أهلاً {name} 👋

طلب انضمامك لـ BuildX HUE وصلنا، وفريقنا هيراجعه ويرد عليك قريب.
رقم طلبك: {ref}

تقدر تتابع حالة طلبك في أي وقت من هنا:
{status_url}

لو عندك أي سؤال رد على الإيميل ده وهنرد عليك.
فريق BuildX HUE 💙$t$),
('application_accepted', true, 'مبروك يا {name}! اتقبلت في BuildX HUE 🎉',
$t$أهلاً {name} 👋

يسعدنا نقولك إن طلبك اتقبل، وبقيت رسمي من فريق BuildX HUE 💙
هنتواصل معاك على الموبايل بخصوص أول خطوة ومواعيد السيشنز.

رقم طلبك: {ref}
{status_url}

مستنيينك!
فريق BuildX HUE$t$),
('application_rejected', false, 'بخصوص طلبك في BuildX HUE',
$t$أهلاً {name}،

شكراً إنك قدّمت في BuildX HUE. المرة دي مقدرناش نقبل الطلب، وده مش آخر الطريق: تقدر تقدّم تاني في الدفعة الجاية، وتحضر الفعاليات والورش المفتوحة.

رقم طلبك: {ref}

بالتوفيق، وهنكون مبسوطين نشوفك تاني.
فريق BuildX HUE$t$),
('family_joined', true, 'أهلاً بيك في أسرة BuildX يا {name} 💙',
$t$أهلاً {name} 👋

تسجيلك في أسرة BuildX للعام الجامعي {year} وصلنا، وبقيت رسمي معانا في كشف الأسرة.
رقم التسجيل: {ref}

ادخل جروب الأسرة على واتساب عشان توصلك الإعلانات والرحلات أول بأول:
{group}

فريق BuildX HUE$t$),
('contact_received', true, 'وصلتنا رسالتك يا {name}',
$t$أهلاً {name} 👋

رسالتك وصلتنا، وهنرد عليك في أقرب وقت.

لو حابب تضيف حاجة، رد على الإيميل ده.
فريق BuildX HUE$t$),
('event_registered', true, 'تذكرتك لـ {event} 🎟️',
$t$أهلاً {name} 👋

تسجيلك في «{event}» اتأكد.
الميعاد: {date}
المكان: {place}

دي تذكرتك (ورّي الـ QR على الباب):
{ticket_url}

نشوفك هناك!
فريق BuildX HUE$t$)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────── helpers
create or replace function private.email_key() returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.id = (select key_secret from private.email_account where id = 1)
$$;
revoke execute on function private.email_key() from public, anon, authenticated;

create or replace function private.email_ok(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null and char_length(p) <= 254 and p ~* '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,24}$'
$$;
revoke execute on function private.email_ok(text) from public, anon;
grant execute on function private.email_ok(text) to authenticated;

/** The token in an unsubscribe link for one address. */
create or replace function private.email_unsub_token(p_email text) returns text
language sql stable security definer set search_path = ''
as $$
  select left(encode(extensions.hmac(lower(btrim(p_email)),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = (select unsub_secret from private.email_keys where id = 1)),
    'sha256'), 'hex'), 32)
$$;
revoke execute on function private.email_unsub_token(text) from public, anon, authenticated;

create or replace function private.email_unsub_url(p_email text) returns text
language sql stable security definer set search_path = ''
as $$
  select 'https://buildxhue.com/ar/unsubscribe/?e='
      || replace(replace(replace(replace(lower(btrim(p_email)), '%', '%25'), '+', '%2B'), '@', '%40'), '&', '%26')
      || '&t=' || private.email_unsub_token(p_email)
$$;
revoke execute on function private.email_unsub_url(text) from public, anon, authenticated;

/** Plain text → the email's HTML: escaped, links clickable, the BuildX header and footer. */
create or replace function private.email_html(p_text text, p_unsub text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
begin
  v := regexp_replace(v, '(https?://[^[:space:]<]+)', '<a href="\1" style="color:#2b6dff;word-break:break-all">\1</a>', 'g');
  v := replace(v, E'\n', '<br>');
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    || '<body style="margin:0;padding:0;background:#eef2f9">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Tahoma,Arial,sans-serif">'
    || '<tr><td style="background:#081634;padding:20px 28px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.5px" dir="ltr" align="left">BuildX <span style="color:#38dcff">HUE</span></td></tr>'
    || '<tr><td dir="rtl" style="padding:28px;color:#14213d;font-size:15px;line-height:1.9;text-align:right">' || v || '</td></tr>'
    || '<tr><td dir="rtl" style="padding:16px 28px;background:#f6f8fc;color:#6b7690;font-size:12px;line-height:1.7;text-align:right">'
    || 'BuildX HUE · مجتمع الروبوتكس والابتكار بجامعة حورس · <a href="https://buildxhue.com" style="color:#6b7690">buildxhue.com</a>'
    || case when p_unsub is null then '' else '<br><a href="' || replace(p_unsub, '&', '&amp;') || '" style="color:#6b7690">إلغاء الاشتراك في رسايلنا</a>' end
    || '</td></tr></table></td></tr></table></body></html>';
end $$;
revoke execute on function private.email_html(text, text) from public, anon;
grant execute on function private.email_html(text, text) to authenticated;

/** Fill {name} and the rest; a line with a {…} that has no value is left out. */
create or replace function private.email_fill(p_text text, p_vars jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_line text;
  v_out text[] := '{}';
  k text;
  v text;
  v_skip boolean;
begin
  foreach v_line in array string_to_array(coalesce(p_text, ''), E'\n') loop
    v_skip := false;
    for k in select (regexp_matches(v_line, '\{([a-z_]{1,30})\}', 'g'))[1] loop
      v := nullif(btrim(coalesce(p_vars ->> k, '')), '');
      if v is null then
        v_skip := true;
      else
        v_line := replace(v_line, '{' || k || '}', v);
      end if;
    end loop;
    if not v_skip then
      v_out := v_out || v_line;
    end if;
  end loop;
  return array_to_string(v_out, E'\n');
end $$;
revoke execute on function private.email_fill(text, jsonb) from public, anon;
grant execute on function private.email_fill(text, jsonb) to authenticated;

/**
 * Queues one email through Resend. Null (and a "skipped" line in the log) when the address unsubscribed.
 * Raises when email isn't connected, the address is wrong or the daily limit is reached.
 */
create or replace function private.email_queue(p_to text, p_name text, p_subject text, p_text text, p_kind text,
  p_template text, p_context text, p_by uuid, p_bulk boolean)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  a private.email_account;
  v_to text := lower(btrim(coalesce(p_to, '')));
  v_id bigint;
  v_unsub text;
  v_body jsonb;
begin
  select * into a from private.email_account where id = 1;
  if a.status is distinct from 'ok' then
    raise exception 'email_not_connected' using errcode = 'P0001';
  end if;
  if not private.email_ok(v_to) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (select 1 from public.email_suppressions where email = v_to) then
    insert into public.email_messages (to_email, to_name, subject, kind, template, context, status, error, created_by)
    values (v_to, nullif(left(btrim(coalesce(p_name, '')), 120), ''), left(p_subject, 200), p_kind, p_template, left(p_context, 120), 'skipped', 'unsubscribed', p_by);
    return null;
  end if;
  if (select count(*) from public.email_messages where created_at > now() - interval '1 day' and status in ('queued', 'sent')) >= a.daily_limit then
    raise exception 'daily_limit' using errcode = '22023';
  end if;
  v_unsub := case when p_bulk then private.email_unsub_url(v_to) end;
  insert into public.email_messages (to_email, to_name, subject, body, kind, template, context, created_by)
  values (v_to, nullif(left(btrim(coalesce(p_name, '')), 120), ''), left(p_subject, 200), left(p_text, 20000), p_kind, p_template, left(p_context, 120), p_by)
  returning id into v_id;
  v_body := jsonb_build_object(
    'from', a.from_name || ' <' || a.from_email || '>',
    'to', jsonb_build_array(v_to),
    'subject', left(p_subject, 200),
    'text', p_text || case when v_unsub is null then '' else E'\n\n—\nإلغاء الاشتراك: ' || v_unsub end,
    'html', private.email_html(p_text, v_unsub))
    || case when a.reply_to is null then '{}'::jsonb else jsonb_build_object('reply_to', a.reply_to) end
    || case when v_unsub is null then '{}'::jsonb else jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || v_unsub || '>')) end;
  update public.email_messages set request_id = net.http_post(
      url := 'https://api.resend.com/emails',
      body := v_body,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || private.email_key()),
      timeout_milliseconds := 15000)
   where id = v_id;
  return v_id;
end $$;
revoke execute on function private.email_queue(text, text, text, text, text, text, text, uuid, boolean) from public, anon, authenticated;

/** An automatic email (template p_key). Never raises: the form it follows always goes through. */
create or replace function private.email_auto(p_key text, p_to text, p_name text, p_vars jsonb, p_context text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t private.email_templates;
  v_vars jsonb;
begin
  if not private.email_ok(lower(btrim(coalesce(p_to, '')))) then
    return;
  end if;
  if not exists (select 1 from private.email_account where id = 1 and status = 'ok') then
    return;
  end if;
  select * into t from private.email_templates where key = p_key and enabled;
  if not found then
    return;
  end if;
  v_vars := coalesce(p_vars, '{}'::jsonb) || jsonb_build_object(
    'name', coalesce(nullif(split_part(btrim(coalesce(p_name, '')), ' ', 1), ''), ''),
    'full_name', btrim(coalesce(p_name, '')));
  perform private.email_queue(p_to, p_name, private.email_fill(t.subject, v_vars), private.email_fill(t.body, v_vars),
                              'auto', p_key, p_context, null, false);
exception when others then
  return;
end $$;
revoke execute on function private.email_auto(text, text, text, jsonb, text) from public, anon, authenticated;

/** Reads Resend's answers: the key check (with its domains) and each email (sent with its id, or why not). */
create or replace function private.email_reconcile() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a private.email_account;
  r record;
  c jsonb;
begin
  select * into a from private.email_account where id = 1;
  if found and a.status = 'checking' and a.check_request is not null then
    select * into r from net._http_response where id = a.check_request;
    if found then
      c := case when r.content ~ '^\s*[\{\[]' then r.content::jsonb else '{}'::jsonb end;
      if r.status_code = 200 then
        update private.email_account set status = 'ok', error = null, checked_at = now(),
               domains = coalesce((select jsonb_agg(jsonb_build_object('name', d ->> 'name', 'status', d ->> 'status'))
                                     from jsonb_array_elements(case when jsonb_typeof(c -> 'data') = 'array' then c -> 'data' else '[]'::jsonb end) d), '[]'::jsonb)
         where id = 1;
      elsif r.status_code = 401 and coalesce(c ->> 'name', '') = 'restricted_api_key' then
        -- A "sending access" key: it can send but can't list the domains.
        update private.email_account set status = 'ok', error = null, checked_at = now(), domains = null where id = 1;
      else
        update private.email_account set status = 'failed', checked_at = now(),
               error = left(coalesce(c ->> 'message', r.error_msg, 'HTTP ' || r.status_code), 300) where id = 1;
      end if;
    elsif a.updated_at < now() - interval '2 minutes' then
      update private.email_account set status = 'failed', error = 'Resend did not answer', checked_at = now() where id = 1;
    end if;
  end if;
  for r in select m.id, h.status_code, h.content, h.error_msg from public.email_messages m
             join net._http_response h on h.id = m.request_id
            where m.status = 'queued' loop
    c := case when r.content ~ '^\s*\{' then r.content::jsonb else '{}'::jsonb end;
    if r.status_code between 200 and 299 and c ->> 'id' is not null then
      update public.email_messages set status = 'sent', provider_id = left(c ->> 'id', 100), sent_at = now() where id = r.id;
    else
      update public.email_messages set status = 'failed',
             error = left(coalesce(c ->> 'message', r.error_msg, 'HTTP ' || r.status_code), 300) where id = r.id;
    end if;
  end loop;
  update public.email_messages set status = 'failed', error = 'no answer from Resend'
   where status = 'queued' and created_at < now() - interval '10 minutes';
end $$;
revoke execute on function private.email_reconcile() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── staff
/** Owner / full admin: connect (or change) Resend. The key is stored in Vault only. */
create or replace function public.staff_email_connect(p_key text, p_from_email text, p_from_name text default 'BuildX HUE',
  p_reply_to text default null, p_daily_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a private.email_account;
  v_secret uuid;
  v_key text := btrim(coalesce(p_key, ''));
  v_from text := lower(btrim(coalesce(p_from_email, '')));
  v_name text := btrim(coalesce(nullif(btrim(p_from_name), ''), 'BuildX HUE'));
  v_reply text := nullif(lower(btrim(coalesce(p_reply_to, ''))), '');
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.email_ok(v_from) or (v_reply is not null and not private.email_ok(v_reply))
     or char_length(v_name) > 80 or v_name ~ '[<>"\r\n]' or coalesce(p_daily_limit, 100) not between 1 and 50000 then
    raise exception 'invalid_sender' using errcode = '22023';
  end if;
  select * into a from private.email_account where id = 1;
  if v_key = '' then
    if a.key_secret is null or a.status = 'off' then
      raise exception 'key_required' using errcode = '22023';
    end if;
    v_secret := a.key_secret;
  elsif v_key !~ '^re_[A-Za-z0-9_]{16,120}$' then
    raise exception 'invalid_key' using errcode = '22023';
  elsif a.key_secret is not null then
    perform vault.update_secret(a.key_secret, v_key);
    v_secret := a.key_secret;
  else
    v_secret := vault.create_secret(v_key, 'resend_api_key', 'Resend API key (BuildX App email)');
  end if;
  insert into private.email_account (id, key_secret, from_email, from_name, reply_to, daily_limit, status, connected_by, updated_at, error)
  values (1, v_secret, v_from, v_name, v_reply, coalesce(p_daily_limit, 100), 'checking', auth.uid(), now(), null)
  on conflict (id) do update set key_secret = excluded.key_secret, from_email = excluded.from_email, from_name = excluded.from_name,
    reply_to = excluded.reply_to, daily_limit = excluded.daily_limit, status = 'checking', connected_by = excluded.connected_by,
    updated_at = now(), error = null;
  update private.email_account set check_request = net.http_get(
      url := 'https://api.resend.com/domains',
      headers := jsonb_build_object('Authorization', 'Bearer ' || private.email_key()),
      timeout_milliseconds := 15000)
   where id = 1;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'email_connect', 'email', v_from,
          jsonb_build_object('new_key', v_key <> '', 'daily_limit', p_daily_limit));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.staff_email_connect(text, text, text, text, int) from public, anon;
grant execute on function public.staff_email_connect(text, text, text, text, int) to authenticated;

/** Owner / full admin: stop sending (the key is overwritten in Vault). */
create or replace function public.staff_email_disconnect() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret uuid := (select key_secret from private.email_account where id = 1);
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_secret is not null then
    perform vault.update_secret(v_secret, 'disconnected');
  end if;
  update private.email_account set status = 'off', domains = null, updated_at = now() where id = 1;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'email_disconnect', 'email', null, '{}'::jsonb);
end $$;
revoke execute on function public.staff_email_disconnect() from public, anon;
grant execute on function public.staff_email_disconnect() to authenticated;

/** The connection as the app shows it (never the key), with today's numbers. */
create or replace function public.staff_email_status() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a private.email_account;
  v_domain text;
begin
  if not (private.can_read('email') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.email_reconcile();
  select * into a from private.email_account where id = 1;
  v_domain := split_part(a.from_email, '@', 2);
  return jsonb_build_object(
    'connected', coalesce(a.status = 'ok', false),
    'status', coalesce(a.status, 'none'),
    'from_email', a.from_email, 'from_name', a.from_name, 'reply_to', a.reply_to, 'daily_limit', coalesce(a.daily_limit, 100),
    'domains', a.domains,
    'domain_ok', case when a.domains is null then null
                      else exists (select 1 from jsonb_array_elements(a.domains) d where lower(d ->> 'name') = lower(v_domain) and d ->> 'status' = 'verified') end,
    'error', a.error, 'checked_at', a.checked_at,
    'has_key', a.key_secret is not null and a.status <> 'off',
    'sent_today', (select count(*) from public.email_messages where created_at > date_trunc('day', now()) and status in ('queued', 'sent')),
    'failed_today', (select count(*) from public.email_messages where created_at > date_trunc('day', now()) and status = 'failed'),
    'last_day', (select count(*) from public.email_messages where created_at > now() - interval '1 day' and status in ('queued', 'sent')),
    'unsubscribed', (select count(*) from public.email_suppressions),
    'my_email', (select email from public.staff where user_id = auth.uid()),
    'can_send', private.can('email'), 'can_connect', private.is_admin());
end $$;
revoke execute on function public.staff_email_status() from public, anon;
grant execute on function public.staff_email_status() to authenticated;

/** Send to a list of people: [{email, name}]. "{name}" becomes each person's first name. */
create or replace function public.staff_email_send(p_people jsonb, p_subject text, p_text text, p_context text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p jsonb;
  v_email text;
  v_name text;
  v_seen text[] := '{}';
  v_bad int := 0;
  v_off int := 0;
  v_n int := 0;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_text text := btrim(coalesce(p_text, ''));
  v_vars jsonb;
  v_left int;
begin
  if not private.can('email') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_subject = '' or char_length(v_subject) > 200 or v_text = '' or char_length(v_text) > 20000
     or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if jsonb_array_length(p_people) > 300 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  if not exists (select 1 from private.email_account where id = 1 and status = 'ok') then
    raise exception 'email_not_connected' using errcode = 'P0001';
  end if;
  v_left := (select daily_limit from private.email_account where id = 1)
          - (select count(*) from public.email_messages where created_at > now() - interval '1 day' and status in ('queued', 'sent'));
  if v_left < jsonb_array_length(p_people) then
    raise exception 'daily_limit' using errcode = '22023', detail = greatest(v_left, 0)::text;
  end if;
  for p in select * from jsonb_array_elements(p_people) loop
    v_email := lower(btrim(coalesce(p ->> 'email', '')));
    if not private.email_ok(v_email) or v_email = any(v_seen) then
      v_bad := v_bad + 1;
      continue;
    end if;
    v_seen := v_seen || v_email;
    v_name := left(btrim(coalesce(p ->> 'name', '')), 120);
    v_vars := jsonb_build_object('name', coalesce(nullif(split_part(v_name, ' ', 1), ''), ''), 'full_name', v_name);
    if private.email_queue(v_email, v_name, private.email_fill(v_subject, v_vars), private.email_fill(v_text, v_vars),
                           'manual', null, left(p_context, 120), auth.uid(), true) is null then
      v_off := v_off + 1;
    else
      v_n := v_n + 1;
    end if;
  end loop;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'email_send', 'email', p_context,
          jsonb_build_object('count', v_n, 'subject', left(v_subject, 120)));
  return jsonb_build_object('queued', v_n, 'skipped', v_bad, 'unsubscribed', v_off);
end $$;
revoke execute on function public.staff_email_send(jsonb, text, text, text) from public, anon;
grant execute on function public.staff_email_send(jsonb, text, text, text) to authenticated;

/** A test email to the signed-in staff member's own address. */
create or replace function public.staff_email_test() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff;
begin
  if not (private.can('email') or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_me from public.staff where user_id = auth.uid();
  perform private.email_queue(v_me.email, v_me.full_name, 'رسالة تجربة من تطبيق BuildX ✅',
    E'أهلاً ' || coalesce(nullif(split_part(btrim(coalesce(v_me.full_name, '')), ' ', 1), ''), '') || E' 👋\n\nلو الرسالة دي وصلتك يبقى إيميلات BuildX HUE شغالة تمام.\n\nhttps://buildxhue.com',
    'test', null, 'test', auth.uid(), false);
  return jsonb_build_object('to', v_me.email);
end $$;
revoke execute on function public.staff_email_test() from public, anon;
grant execute on function public.staff_email_test() to authenticated;

/** The automatic emails, as the app edits them. */
create or replace function public.staff_email_templates() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_read('email') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', key, 'enabled', enabled, 'subject', subject, 'body', body, 'updated_at', updated_at) order by key)
                     from private.email_templates), '[]'::jsonb);
end $$;
revoke execute on function public.staff_email_templates() from public, anon;
grant execute on function public.staff_email_templates() to authenticated;

create or replace function public.staff_email_template_save(p_key text, p_enabled boolean, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can('email') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200 or char_length(btrim(coalesce(p_body, ''))) not between 1 and 8000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  update private.email_templates set enabled = coalesce(p_enabled, enabled), subject = btrim(p_subject), body = btrim(p_body),
         updated_by = auth.uid(), updated_at = now()
   where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'email_template', 'email', p_key,
          jsonb_build_object('enabled', p_enabled));
end $$;
revoke execute on function public.staff_email_template_save(text, boolean, text, text) from public, anon;
grant execute on function public.staff_email_template_save(text, boolean, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────── unsubscribe (the public page)
create or replace function public.email_unsubscribe(p_email text, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.throttle('email_unsub', 30, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if not private.email_ok(v_email) or coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or p_token <> private.email_unsub_token(v_email) then
    raise exception 'invalid_link' using errcode = '22023';
  end if;
  insert into public.email_suppressions (email, reason) values (v_email, 'unsubscribed') on conflict (email) do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.email_unsubscribe(text, text) from public;
grant execute on function public.email_unsubscribe(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── automatic emails
create or replace function private.applications_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_vars jsonb := jsonb_build_object('ref', new.ref,
    'status_url', 'https://buildxhue.com' || case when new.locale = 'en' then '' else '/ar' end || '/join/status/?ref=' || new.ref);
begin
  if tg_op = 'INSERT' then
    perform private.email_auto('application_received', new.email, new.full_name, v_vars, 'application:' || new.ref);
  elsif new.status is distinct from old.status and new.status::text in ('accepted', 'rejected') then
    perform private.email_auto('application_' || new.status::text, new.email, new.full_name, v_vars, 'application:' || new.ref);
  end if;
  return null;
end $$;
revoke execute on function private.applications_email() from public, anon, authenticated;
create trigger applications_email after insert or update of status on public.applications
  for each row execute function private.applications_email();

create or replace function private.family_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.email_auto('family_joined', new.email, new.full_name,
    jsonb_build_object('ref', new.ref, 'year', new.academic_year, 'group', private.family_group()), 'family:' || new.ref);
  return null;
end $$;
revoke execute on function private.family_email() from public, anon, authenticated;
create trigger family_members_email after insert on public.family_members
  for each row execute function private.family_email();

create or replace function private.inbox_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.email_auto('contact_received', new.email, new.name, jsonb_build_object('topic', new.topic), 'inbox:' || new.kind);
  return null;
end $$;
revoke execute on function private.inbox_email() from public, anon, authenticated;
create trigger inbox_messages_email after insert on public.inbox_messages
  for each row execute function private.inbox_email();

create or replace function private.event_registration_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  e public.site_content;
begin
  if new.status <> 'going' then
    return null;
  end if;
  select * into e from public.site_content where id = new.event_id;
  perform private.email_auto('event_registered', new.email, new.full_name, jsonb_build_object(
      'event', coalesce(nullif(e.title_ar, ''), e.title),
      'date', case when e.starts_at is null then null else to_char(e.starts_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') end,
      'place', coalesce(nullif(e.location_ar, ''), e.location),
      'ticket', new.ticket,
      'ticket_url', 'https://buildxhue.com/ar/ticket/?t=' || new.ticket), 'event:' || new.event_id);
  return null;
end $$;
revoke execute on function private.event_registration_email() from public, anon, authenticated;
create trigger event_registrations_email after insert on public.event_registrations
  for each row execute function private.event_registration_email();

-- Resend's answers are read every two minutes (and whenever someone opens the screen).
select cron.schedule('email-reconcile', '*/2 * * * *', $$select private.email_reconcile()$$);
