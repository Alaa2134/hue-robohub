-- Push notifications for the BuildX App (students and staff). Staff write a message in the app; the
-- send-push Edge Function delivers it with the VAPID key kept in private.app_secrets (inserted
-- directly, never committed). Subscriptions that the push service reports gone are switched off, not deleted.

create table private.app_secrets (
  name text primary key,
  value text not null
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  audience text not null check (audience in ('student', 'staff')),
  student_id uuid references public.students (id) on delete cascade,
  staff_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_subscriptions_student_idx on public.push_subscriptions (student_id);
create index push_subscriptions_staff_idx on public.push_subscriptions (staff_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using ((select private.is_admin()));
grant select on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

create table public.push_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  body text not null default '' check (char_length(body) <= 240),
  url text check (url is null or url ~ '^(https://|/)' and char_length(url) <= 300),
  audience text not null check (audience in ('students', 'group', 'staff', 'everyone')),
  group_name text check (char_length(group_name) <= 60),
  sent_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  targets int,
  delivered int,
  failed int
);
create index push_messages_sent_by_idx on public.push_messages (sent_by);
alter table public.push_messages enable row level security;
create policy push_messages_select on public.push_messages for select to authenticated using ((select private.is_staff()));
grant select on public.push_messages to authenticated;
revoke all on public.push_messages from anon;

/** A student turns notifications on in the app. 20 per address per hour. */
create or replace function public.push_subscribe_student(p_token text, p_sub jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  if not private.throttle('push_sub', 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, audience, student_id)
  values (p_sub ->> 'endpoint', p_sub #>> '{keys,p256dh}', p_sub #>> '{keys,auth}', 'student', v_id)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, audience = 'student', student_id = v_id, staff_id = null, disabled_at = null;
  return jsonb_build_object('ok', true);
exception when check_violation or not_null_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** A staff member turns notifications on. */
create or replace function public.push_subscribe_staff(p_sub jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, audience, staff_id)
  values (p_sub ->> 'endpoint', p_sub #>> '{keys,p256dh}', p_sub #>> '{keys,auth}', 'staff', auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, audience = 'staff', staff_id = auth.uid(), student_id = null, disabled_at = null;
  return jsonb_build_object('ok', true);
exception when check_violation or not_null_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** Turn one device off (the endpoint itself is the proof: only that browser knows it). */
create or replace function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = ''
as $$
  update public.push_subscriptions set disabled_at = now() where endpoint = p_endpoint and disabled_at is null
$$;

/** Staff (owners/admins) queue a message; the Edge Function sends it. */
create or replace function public.staff_push_create(p_title text, p_body text, p_url text, p_audience text, p_group text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.push_messages (title, body, url, audience, group_name)
  values (btrim(p_title), coalesce(btrim(p_body), ''), nullif(btrim(coalesce(p_url, '')), ''), p_audience, nullif(btrim(coalesce(p_group, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

/** Edge Function only (service role): the key and the devices for one message. */
create or replace function public.push_targets(p_message uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'message', to_jsonb(m) - 'sent_by',
    'vapid', jsonb_build_object(
      'public', (select value from private.app_secrets where name = 'vapid_public'),
      'private', (select value from private.app_secrets where name = 'vapid_private'),
      'subject', (select value from private.app_secrets where name = 'vapid_subject')),
    'subs', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
        from public.push_subscriptions s
        left join public.students st on st.id = s.student_id
       where s.disabled_at is null
         and case m.audience
               when 'staff' then s.audience = 'staff'
               when 'students' then s.audience = 'student' and st.active
               when 'group' then s.audience = 'student' and st.active and st.group_name = m.group_name
               else s.audience = 'staff' or st.active
             end
    ), '[]'::jsonb)
  )
  from public.push_messages m where m.id = p_message
$$;

/** Edge Function only: record the outcome and switch off devices the push service says are gone. */
create or replace function public.push_report(p_message uuid, p_targets int, p_delivered int, p_gone text[]) returns void
language sql security definer set search_path = ''
as $$
  update public.push_messages set targets = p_targets, delivered = p_delivered, failed = p_targets - p_delivered where id = p_message;
  update public.push_subscriptions set disabled_at = now() where endpoint = any (coalesce(p_gone, '{}')) and disabled_at is null;
$$;

revoke execute on function public.push_subscribe_student(text, jsonb), public.push_subscribe_staff(jsonb), public.push_unsubscribe(text),
  public.staff_push_create(text, text, text, text, text), public.push_targets(uuid), public.push_report(uuid, int, int, text[]) from public, anon, authenticated;
grant execute on function public.push_subscribe_student(text, jsonb), public.push_unsubscribe(text) to anon, authenticated;
grant execute on function public.push_subscribe_staff(jsonb), public.staff_push_create(text, text, text, text, text) to authenticated;
grant execute on function public.push_targets(uuid), public.push_report(uuid, int, int, text[]) to service_role;
