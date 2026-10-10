-- The team's notification centre: every notification to a team member (a task, a warning, a new
-- application, a site message…) is also kept in their in-app list, so nothing is missed on a phone
-- without push set up. Read state per person; the list shows the latest 60.

create table public.staff_inbox (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 400),
  url text check (url is null or (url ~ '^/' and char_length(url) <= 300)),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index staff_inbox_staff_idx on public.staff_inbox (staff_id, created_at desc);
create index staff_inbox_unread_idx on public.staff_inbox (staff_id) where read_at is null;
alter table public.staff_inbox enable row level security;
revoke all on public.staff_inbox from anon, authenticated;

/** Into the in-app list of these people (never fails the caller). */
create or replace function private.inbox_add(p_ids uuid[], p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.staff_inbox (staff_id, title, body, url)
  select s.user_id, left(btrim(p_title), 120), left(coalesce(btrim(p_body), ''), 400), case when p_url ~ '^/' then left(p_url, 300) end
    from public.staff s where s.active and s.user_id = any(p_ids);
exception when others then
  null;
end $$;
revoke execute on function private.inbox_add(uuid[], text, text, text) from public, anon, authenticated;

/** A notification to these team members only: their in-app list, browsers and phones. */
create or replace function private.notify_staff_users(p_ids uuid[], p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(p_ids) as x where x is not null);
  v_id uuid;
  v_token text;
begin
  if cardinality(v_ids) = 0 then
    return;
  end if;
  perform private.inbox_add(v_ids, p_title, p_body, p_url);
  if not exists (select 1 from public.push_subscriptions where audience = 'staff' and disabled_at is null and staff_id = any(v_ids))
     and not exists (select 1 from public.native_push_tokens where app = 'staff' and disabled_at is null and staff_id = any(v_ids)) then
    return;
  end if;
  insert into public.push_messages (title, body, url, audience, to_staff)
  values (left(btrim(p_title), 80), left(coalesce(btrim(p_body), ''), 240), p_url, 'staff', v_ids)
  returning id into v_id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.push_tokens (message_id, token) values (v_id, v_token);
  perform net.http_post(
    url := 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/push-deliver',
    body := jsonb_build_object('id', v_id, 'token', v_token),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  null;
end $$;

/** A notification to everyone working in an area (null = the whole team): in-app list, browsers and phones. */
create or replace function private.notify_staff(p_area text, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
begin
  if exists (select 1 from public.push_messages where area is not distinct from p_area and sent_by is null and to_staff is null
              and title = left(btrim(p_title), 80) and created_at > now() - interval '1 minute') then
    return;
  end if;
  perform private.inbox_add(array(select s.user_id from public.staff s
                                   where s.active and (p_area is null or private.member_can(s.role, s.permissions, p_area))),
                            p_title, p_body, p_url);
  if not exists (select 1 from public.push_subscriptions where audience = 'staff' and disabled_at is null)
     and not exists (select 1 from public.native_push_tokens where app = 'staff' and disabled_at is null) then
    return;
  end if;
  insert into public.push_messages (title, body, url, audience, area)
  values (left(btrim(p_title), 80), left(coalesce(btrim(p_body), ''), 240), p_url, 'staff', p_area)
  returning id into v_id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.push_tokens (message_id, token) values (v_id, v_token);
  perform net.http_post(
    url := 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/push-deliver',
    body := jsonb_build_object('id', v_id, 'token', v_token),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  null;
end $$;

/** My notifications (latest 60) and how many are unread. */
create or replace function public.staff_notifications() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'unread', (select count(*) from public.staff_inbox where staff_id = auth.uid() and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'url', i.url, 'created_at', i.created_at, 'read', i.read_at is not null) order by i.created_at desc)
                         from (select * from public.staff_inbox where staff_id = auth.uid() order by created_at desc limit 60) i), '[]'::jsonb));
end $$;

/** Mark my notifications read (these, or all of them). */
create or replace function public.staff_notifications_read(p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_inbox set read_at = now()
   where staff_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.staff_notifications(), public.staff_notifications_read(uuid[]) from public, anon;
grant execute on function public.staff_notifications(), public.staff_notifications_read(uuid[]) to authenticated;
