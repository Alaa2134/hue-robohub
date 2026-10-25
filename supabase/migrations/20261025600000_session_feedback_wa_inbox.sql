-- 1) After a session: whoever was marked present rates it out of 5 and writes what they thought, from
--    their QR page on the site. A WhatsApp moment sends them the button to it two hours after they
--    were scanned in (daytime only), once per session, and only if they haven't rated it yet. The team
--    sees each session's average and the comments in the attendance screen.
-- 2) A WhatsApp inbox: Meta sends the messages people write to the team's number (and whether ours
--    were delivered and read) to the wa-webhook function, which hands them to wa_webhook_ingest here.
--    The webhook's address carries a long random key that only the database (and the owner's app
--    screen) knows; anything without it is refused. Each new message notifies the WhatsApp team.

-- ── 1. Session ratings ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.form_session_feedback (
  response_id uuid not null references public.form_responses (id) on delete cascade,
  session text not null check (char_length(session) <= 60),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (response_id, session)
);
alter table public.form_session_feedback enable row level security;
create policy form_session_feedback_read on public.form_session_feedback for select to authenticated
  using ((select private.can_read('forms')));
revoke all on public.form_session_feedback from anon;
grant select on public.form_session_feedback to authenticated;

-- Rate a session from the QR page (only one the holder was marked present at); rating again updates it.
create or replace function public.form_session_rate(p_token text, p_session text, p_rating int, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_rate', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_rating is null or p_rating not between 1 and 5 or char_length(coalesce(p_comment, '')) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into r from public.form_responses where pass = upper(btrim(coalesce(p_token, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into f from public.forms where id = r.form_id;
  if f.archived or not coalesce((f.attendance ->> 'on')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from public.form_attendance a where a.response_id = r.id and a.session = p_session and a.present) then
    return jsonb_build_object('ok', false, 'error', 'not_attended');
  end if;
  insert into public.form_session_feedback (response_id, session, rating, comment)
  values (r.id, p_session, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (response_id, session) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.form_session_rate(text, text, int, text) from public;
grant execute on function public.form_session_rate(text, text, int, text) to anon, authenticated;

-- The QR page also says how each attended session was rated.
do $$
declare
  def text := pg_get_functiondef('public.form_pass(text)'::regprocedure);
  a1 text := E'''here_at'', case when a.present then a.at end)';
  a2 text := E'left join public.form_attendance a on a.response_id = r.id and a.session = s ->> ''id''';
begin
  if position('form_session_feedback' in def) > 0 then
    return;
  end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then
    raise exception 'form_pass changed: cannot add the ratings';
  end if;
  def := replace(def, a1, E'''here_at'', case when a.present then a.at end, ''rating'', fb.rating, ''comment'', fb.comment)');
  def := replace(def, a2, a2 || E'\n                   left join public.form_session_feedback fb on fb.response_id = r.id and fb.session = s ->> ''id''');
  execute def;
end $$;

-- The WhatsApp moment: our template (sent to Meta by the 10-minute job), on from now.
insert into private.wa_templates (name, category, moments, example, body, button_text, button_url, button_example) values
  ('bx_form_session_feedback_v5', 'UTILITY', '{form_session_feedback}', '{Workshop 01 — اليوم الأول}',
   'شكرًا إنك حضرت {{1}} مع BuildX HUE 💙 قيّم السيشن من 5 واكتب رأيك في دقيقة من الزرار تحت، رأيك بيفرق معانا.',
   'قيّم السيشن', 'https://buildxhue.com/ar/form/?pass={{1}}', 'https://buildxhue.com/ar/form/?pass=3f9a21c7b4e8d012')
on conflict (name) do update set category = excluded.category, moments = excluded.moments, example = excluded.example, body = excluded.body,
  button_text = excluded.button_text, button_url = excluded.button_url, button_example = excluded.button_example
 where private.wa_templates.meta_id is null;

insert into private.wa_auto_rules (key, section, sort, label_ar, hint_ar, vars_ar, template, lang, enabled, bulk, enabled_at)
values ('form_session_feedback', 'forms', 50, 'تقييم بعد السيشن',
        'بعد ما يتسجل حضوره في موعد من «الحضور بالـ QR» بساعتين (بين 10 الصبح و9 بالليل)، مرة واحدة لكل موعد، لو لسه مقيّمش',
        '{{1}} الفورم والموعد · زرار بيفتح الـ QR بتاعه وفيه التقييم',
        'bx_form_session_feedback_v5', 'ar', true, false, now())
on conflict (key) do update set section = excluded.section, sort = excluded.sort, label_ar = excluded.label_ar,
  hint_ar = excluded.hint_ar, vars_ar = excluded.vars_ar, template = excluded.template;

do $$
declare
  def text := pg_get_functiondef('private.wa_auto_tick(boolean)'::regprocedure);
  anchor text := E'  v_since := private.wa_since(''session_reminder'');\n';
begin
  if position('form_session_feedback' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'wa_auto_tick changed: no session_reminder block to add the session feedback before';
  end if;
  def := replace(def, anchor,
    E'  v_since := private.wa_since(''form_session_feedback'');\n'
    || E'  if v_since is not null then\n'
    || E'    for x in select r.id, r.name, r.phone, r.pass, f.title_ar, a.session as sid, s ->> ''name'' as sname,\n'
    || E'                    jsonb_array_length(coalesce(f.attendance -> ''sessions'', ''[]''::jsonb)) as n\n'
    || E'               from public.form_attendance a\n'
    || E'               join public.form_responses r on r.id = a.response_id\n'
    || E'               join public.forms f on f.id = r.form_id\n'
    || E'               cross join lateral jsonb_array_elements(private.form_sessions(f.attendance)) s\n'
    || E'              where s ->> ''id'' = a.session and a.present and a.at >= v_since\n'
    || E'                and a.at between now() - interval ''26 hours'' and now() - interval ''2 hours''\n'
    || E'                and r.phone is not null and r.pass is not null and not coalesce(f.archived, false)\n'
    || E'                and coalesce(f.attendance ->> ''on'', ''false'') = ''true''\n'
    || E'                and not exists (select 1 from public.form_session_feedback fb where fb.response_id = r.id and fb.session = a.session) loop\n'
    || E'      perform private.wa_auto_btn(''form_session_feedback'', x.phone, x.name,\n'
    || E'        jsonb_build_array(case when x.n > 0 then x.title_ar || '' — '' || x.sname else x.title_ar end),\n'
    || E'        ''form:'' || x.id || '':feedback:'' || x.sid, lower(x.pass));\n'
    || E'    end loop;\n'
    || E'  end if;\n\n'
    || anchor);
  execute def;
end $$;

-- ── 2. WhatsApp inbox ──────────────────────────────────────────────────────────────────────────────

create table if not exists private.wa_webhook (
  id int primary key default 1 check (id = 1),
  key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  connect_request bigint,
  connected_at timestamptz,
  connect_error text,
  last_hit_at timestamptz,
  created_at timestamptz not null default now()
);
insert into private.wa_webhook (id) values (1) on conflict (id) do nothing;
revoke all on private.wa_webhook from public, anon, authenticated;

create table if not exists public.whatsapp_inbox (
  id bigint generated always as identity primary key,
  wa_id text not null unique,
  from_phone text not null,
  from_name text,
  kind text not null,
  body text,
  media_id text,
  media_mime text,
  reply_to text,
  received_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid
);
create index if not exists whatsapp_inbox_phone_idx on public.whatsapp_inbox (from_phone, received_at desc);
create index if not exists whatsapp_inbox_unread_idx on public.whatsapp_inbox (received_at desc) where read_at is null;
alter table public.whatsapp_inbox enable row level security;
create policy whatsapp_inbox_select on public.whatsapp_inbox for select to authenticated using ((select private.can_read('whatsapp')));
revoke all on public.whatsapp_inbox from anon;
grant select on public.whatsapp_inbox to authenticated;

-- Our messages: when Meta says they reached the phone and were read.
alter table public.whatsapp_messages add column if not exists delivered_at timestamptz;
alter table public.whatsapp_messages add column if not exists read_at timestamptz;
create index if not exists whatsapp_messages_wa_id_idx on public.whatsapp_messages (wa_id) where wa_id is not null;
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (to_phone, created_at desc);

-- Meta's "verify this address" handshake.
create or replace function public.wa_webhook_verify(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.wa_webhook where id = 1 and key = coalesce(p_token, '') and char_length(key) >= 32)
$$;

-- Everything Meta posts: new messages into the inbox, and our messages' delivered / read / failed.
create or replace function public.wa_webhook_ingest(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  ch jsonb;
  v jsonb;
  m jsonb;
  st jsonb;
  v_type text;
  v_body text;
  v_name text;
  v_new int := 0;
  v_status int := 0;
  v_id bigint;
  v_who text;
begin
  if not public.wa_webhook_verify(p_key) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update private.wa_webhook set last_hit_at = now() where id = 1;
  for e in select * from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'entry') = 'array' then p_payload -> 'entry' else '[]' end) loop
    for ch in select * from jsonb_array_elements(case when jsonb_typeof(e -> 'changes') = 'array' then e -> 'changes' else '[]' end) loop
      v := ch -> 'value';
      for m in select * from jsonb_array_elements(case when jsonb_typeof(v -> 'messages') = 'array' then v -> 'messages' else '[]' end) loop
        v_type := coalesce(m ->> 'type', 'unknown');
        v_body := case v_type
          when 'text' then m #>> '{text,body}'
          when 'button' then m #>> '{button,text}'
          when 'interactive' then coalesce(m #>> '{interactive,button_reply,title}', m #>> '{interactive,list_reply,title}')
          when 'reaction' then m #>> '{reaction,emoji}'
          when 'location' then concat_ws(' · ', m #>> '{location,name}', m #>> '{location,address}',
                                         'https://maps.google.com/?q=' || (m #>> '{location,latitude}') || ',' || (m #>> '{location,longitude}'))
          when 'contacts' then (select string_agg(concat_ws(' ', c #>> '{name,formatted_name}', c #>> '{phones,0,phone}'), '، ') from jsonb_array_elements(m -> 'contacts') c)
          else m -> v_type ->> 'caption'
        end;
        select x #>> '{profile,name}' into v_name from jsonb_array_elements(case when jsonb_typeof(v -> 'contacts') = 'array' then v -> 'contacts' else '[]' end) x
         where x ->> 'wa_id' = m ->> 'from' limit 1;
        insert into public.whatsapp_inbox (wa_id, from_phone, from_name, kind, body, media_id, media_mime, reply_to, received_at)
        values (left(m ->> 'id', 200), left(regexp_replace(coalesce(m ->> 'from', ''), '\D', '', 'g'), 20), left(v_name, 120), left(v_type, 30),
                left(v_body, 4096), left(m -> v_type ->> 'id', 200), left(m -> v_type ->> 'mime_type', 100), left(m #>> '{context,id}', 200),
                coalesce(to_timestamp(nullif(m ->> 'timestamp', '')::bigint), now()))
        on conflict (wa_id) do nothing
        returning id into v_id;
        if v_id is not null then
          v_new := v_new + 1;
          v_who := coalesce(nullif(v_name, ''), '+' || (m ->> 'from'));
          perform private.notify_staff('whatsapp', '💬 واتساب من ' || v_who,
            coalesce(left(v_body, 120), case v_type when 'image' then '📷 صورة' when 'audio' then '🎤 رسالة صوتية' when 'video' then '🎬 فيديو'
                                                    when 'document' then '📄 ملف' when 'sticker' then 'ستيكر' else 'رسالة' end),
            '/app/#/staff/wa-inbox/' || (m ->> 'from'));
          v_id := null;
        end if;
      end loop;
      for st in select * from jsonb_array_elements(case when jsonb_typeof(v -> 'statuses') = 'array' then v -> 'statuses' else '[]' end) loop
        v_status := v_status + 1;
        if st ->> 'status' = 'delivered' then
          update public.whatsapp_messages set delivered_at = coalesce(delivered_at, now()) where wa_id = st ->> 'id';
        elsif st ->> 'status' = 'read' then
          update public.whatsapp_messages set read_at = coalesce(read_at, now()), delivered_at = coalesce(delivered_at, now()) where wa_id = st ->> 'id';
        elsif st ->> 'status' = 'failed' then
          update public.whatsapp_messages set status = 'failed',
                 error = left(coalesce(st #>> '{errors,0,error_data,details}', st #>> '{errors,0,title}', st #>> '{errors,0,message}', 'failed')
                              || coalesce(' (' || (st #>> '{errors,0,code}') || ')', ''), 300)
           where wa_id = st ->> 'id' and read_at is null;
        end if;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'messages', v_new, 'statuses', v_status);
end $$;
revoke execute on function public.wa_webhook_verify(text), public.wa_webhook_ingest(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_webhook_verify(text), public.wa_webhook_ingest(text, jsonb) to service_role;

-- The inbox in the app: one row per person, newest first, with their name from what we know of them.
create or replace function public.staff_wa_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c order by c ->> 'last_at' desc)
      from (select jsonb_build_object(
                     'phone', i.from_phone,
                     'name', coalesce((select s.full_name from public.students s where private.wa_phone(s.phone) = i.from_phone limit 1),
                                      (select r.name from public.form_responses r where private.wa_phone(r.phone) = i.from_phone and r.name is not null
                                        order by r.created_at desc limit 1),
                                      (select a.full_name from public.applications a where private.wa_phone(a.phone) = i.from_phone order by a.created_at desc limit 1),
                                      max(i.from_name)),
                     'profile', max(i.from_name),
                     'last_at', max(i.received_at),
                     'last', (select jsonb_build_object('kind', l.kind, 'body', l.body) from public.whatsapp_inbox l
                               where l.from_phone = i.from_phone order by l.received_at desc limit 1),
                     'unread', count(*) filter (where i.read_at is null),
                     'total', count(*)) as c
              from public.whatsapp_inbox i
             group by i.from_phone
             order by max(i.received_at) desc
             limit 300) t), '[]'::jsonb);
end $$;

-- One person's conversation: what they sent and what we sent them, in order; opening it marks it read.
create or replace function public.staff_wa_thread(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not private.can_read('whatsapp') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.can('whatsapp') then
    update public.whatsapp_inbox set read_at = now(), read_by = auth.uid() where from_phone = v_phone and read_at is null;
  end if;
  return jsonb_build_object(
    'phone', v_phone,
    'last_in', (select max(received_at) from public.whatsapp_inbox where from_phone = v_phone),
    'items', coalesce((
      select jsonb_agg(x order by at)
        from (select * from (
                select i.received_at as at, jsonb_build_object('dir', 'in', 'id', i.id, 'kind', i.kind, 'body', i.body, 'at', i.received_at,
                                                               'media', i.media_id is not null) as x
                  from public.whatsapp_inbox i where i.from_phone = v_phone
                union all
                select m.created_at, jsonb_build_object('dir', 'out', 'id', m.id, 'kind', m.kind, 'body', m.body, 'template', m.template, 'at', m.created_at,
                                                        'status', m.status, 'error', m.error, 'delivered', m.delivered_at is not null, 'read', m.read_at is not null)
                  from public.whatsapp_messages m where m.to_phone = v_phone) u
               order by at desc
               limit 200) t), '[]'::jsonb));
end $$;

-- The webhook's address and token for the owner, and whether Meta has been told to use it.
create or replace function public.staff_wa_inbox_setup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w private.wa_webhook;
  h record;
  c jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into w from private.wa_webhook where id = 1;
  if w.connect_request is not null then
    select * into h from net._http_response where id = w.connect_request;
    if found then
      c := case when h.content ~ '^\s*\{' then h.content::jsonb else '{}'::jsonb end;
      if h.status_code between 200 and 299 and coalesce((c ->> 'success')::boolean, false) then
        update private.wa_webhook set connected_at = now(), connect_error = null, connect_request = null where id = 1;
      else
        update private.wa_webhook set connect_error = left(coalesce(c #>> '{error,error_user_msg}', c #>> '{error,message}', h.error_msg, 'HTTP ' || h.status_code), 300),
               connect_request = null where id = 1;
      end if;
      select * into w from private.wa_webhook where id = 1;
    end if;
  end if;
  return jsonb_build_object(
    'url', 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/wa-webhook?k=' || w.key,
    'token', w.key,
    'connecting', w.connect_request is not null,
    'connected_at', w.connected_at,
    'error', w.connect_error,
    'last_hit_at', w.last_hit_at,
    'received', (select count(*) from public.whatsapp_inbox));
end $$;

-- Ask Meta to send this number's messages to our webhook (the WhatsApp account's own override, with the
-- token the team already connected). If Meta refuses, the app shows the address to paste by hand.
create or replace function public.staff_wa_inbox_connect()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a private.whatsapp_account;
  w private.wa_webhook;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from private.whatsapp_account where id = 1 and status = 'ok' and business_id is not null;
  if not found then
    raise exception 'whatsapp_not_connected' using errcode = 'P0001';
  end if;
  select * into w from private.wa_webhook where id = 1;
  update private.wa_webhook set connect_error = null, connect_request = net.http_post(
      url := format('https://graph.facebook.com/%s/%s/subscribed_apps', a.api_version, a.business_id),
      body := jsonb_build_object('override_callback_uri', 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/wa-webhook?k=' || w.key,
                                 'verify_token', w.key),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || private.wa_token()),
      timeout_milliseconds := 20000)
   where id = 1;
  return public.staff_wa_inbox_setup();
end $$;

revoke execute on function public.staff_wa_inbox(), public.staff_wa_thread(text), public.staff_wa_inbox_setup(), public.staff_wa_inbox_connect() from public, anon;
grant execute on function public.staff_wa_inbox(), public.staff_wa_thread(text), public.staff_wa_inbox_setup(), public.staff_wa_inbox_connect() to authenticated;
