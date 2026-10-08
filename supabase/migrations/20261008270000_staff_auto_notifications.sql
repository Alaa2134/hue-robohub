-- The team hears about new work right away, on the phone (the BuildX App's notifications):
--   a new join application    → whoever handles applications
--   a new site message         → whoever handles site messages
--   a draft waiting to publish → whoever may publish
--   the monthly report         → owners and admins (1st of the month, 9 am Cairo)
-- private.notify_staff() writes the message (for one area) and asks the push-deliver function to send
-- it with a one-time token only the database knows. A burst (many in a minute) becomes one
-- notification, and a notification never blocks saving the application or message that caused it.

alter table public.push_messages add column if not exists area text check (char_length(area) <= 20);

create table if not exists private.push_tokens (
  message_id uuid primary key references public.push_messages (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

-- Team messages for one area go only to team members who work in it.
select private.patch_function('public.push_targets(uuid)',
  $p$when 'staff' then s.audience = 'staff'$p$,
  $p$when 'staff' then s.audience = 'staff' and (m.area is null or exists (
                 select 1 from public.staff x
                  where x.user_id = s.staff_id and x.active
                    and (x.role in ('owner', 'admin') or m.area = any(coalesce(x.permissions, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])))))$p$);

create or replace function private.notify_staff(p_area text, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
begin
  if exists (select 1 from public.push_messages where area = p_area and sent_by is null and created_at > now() - interval '1 minute') then
    return;
  end if;
  if not exists (select 1 from public.push_subscriptions where audience = 'staff' and disabled_at is null) then
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
revoke execute on function private.notify_staff(text, text, text, text) from public, anon, authenticated;

/** For push-deliver (service role only): the message's devices and key, once, for its token. */
create or replace function public.push_deliver_claim(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.push_tokens
   where message_id = p_id and token = p_token and created_at > now() - interval '1 hour';
  if not found then
    return null;
  end if;
  return public.push_targets(p_id);
end $$;
revoke execute on function public.push_deliver_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.push_deliver_claim(uuid, text) to service_role;

-- New join application.
create or replace function private.on_application_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify_staff('applications', 'طلب انضمام جديد 🙋',
    new.full_name || coalesce(' · ' || nullif(new.track_first, ''), ''), '/app/#/staff/applications');
  return null;
end $$;
create or replace trigger applications_notify after insert on public.applications for each row execute function private.on_application_notify();

-- New site message or sponsorship request.
create or replace function private.on_inbox_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify_staff('inbox',
    case when new.kind = 'sponsor' then 'طلب رعاية جديد 🤝' else 'رسالة جديدة على الموقع ✉️' end,
    coalesce(new.name, '') || ': ' || left(coalesce(new.topic, new.message, ''), 120), '/app/#/staff/inbox');
  return null;
end $$;
create or replace trigger inbox_notify after insert on public.inbox_messages for each row execute function private.on_inbox_notify();

-- A draft written by someone who can't publish: whoever may publish hears about it.
create or replace function private.on_draft_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published or coalesce(auth.role(), '') <> 'authenticated' or private.is_admin() or private.can('publish') then
    return null;
  end if;
  perform private.notify_staff('publish', 'مسودة مستنية النشر 📝',
    coalesce(nullif(coalesce(new.title_ar, new.title), ''), 'صور جديدة') || ' · ' || coalesce((select full_name from public.staff where user_id = auth.uid()), ''),
    '/app/#/staff/site');
  return null;
end $$;
create or replace trigger site_content_draft_notify after insert on public.site_content for each row execute function private.on_draft_notify();

-- The month in numbers, for owners and admins.
create or replace function private.monthly_report() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_from date := (date_trunc('month', now() - interval '1 day'))::date;
  v_to date := date_trunc('month', now())::date;
  v_visitors bigint;
  v_views bigint;
  v_apps bigint;
  v_msgs bigint;
  v_regs bigint;
begin
  select count(distinct visitor), count(*) into v_visitors, v_views from private.page_views where day >= v_from and day < v_to;
  select count(*) into v_apps from public.applications where created_at >= v_from and created_at < v_to;
  select count(*) into v_msgs from public.inbox_messages where created_at >= v_from and created_at < v_to;
  select count(*) into v_regs from public.event_registrations where created_at >= v_from and created_at < v_to;
  perform private.notify_staff('report', 'تقرير الشهر 📊',
    format('زوار: %s · مشاهدات: %s · طلبات انضمام: %s · رسايل: %s · تسجيلات فعاليات: %s', v_visitors, v_views, v_apps, v_msgs, v_regs),
    '/app/#/staff/stats');
end $$;
revoke execute on function private.monthly_report() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'buildx-monthly-report';
select cron.schedule('buildx-monthly-report', '7 7 1 * *', $$select private.monthly_report()$$);
