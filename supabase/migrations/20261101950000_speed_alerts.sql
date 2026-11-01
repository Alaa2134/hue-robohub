-- Speed alerts next to the downtime alert: every 10 minutes the uptime check also times the answer
-- (one of the main pages in turn). Three slow answers in a row (over 4 s) send one notification
-- «الموقع بطيء»; when it's fast again, one «رجع سريع». Timings are kept in private.uptime_times
-- (144 small rows a day) for the security screen.
alter table private.uptime add column if not exists requested_at timestamptz;
alter table private.uptime add column if not exists url text;
alter table private.uptime add column if not exists slow int not null default 0;
alter table private.uptime add column if not exists slow_alerted boolean not null default false;

create table if not exists private.uptime_times (
  at timestamptz not null default now(),
  url text not null,
  status int,
  ms int
);
create index if not exists uptime_times_at on private.uptime_times (at desc);
alter table private.uptime_times enable row level security;
revoke all on private.uptime_times from public, anon, authenticated;

create or replace function private.uptime_check() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u private.uptime%rowtype;
  v_status int;
  v_ms int;
  v_pages text[] := array['https://buildxhue.com/', 'https://buildxhue.com/ar/', 'https://buildxhue.com/ar/events/', 'https://buildxhue.com/ar/join/'];
  v_next text;
begin
  select * into u from private.uptime where id = 1 for update;
  if u.request_id is not null then
    select r.status_code, case when u.requested_at is not null then (extract(epoch from (r.created - u.requested_at)) * 1000)::int end
      into v_status, v_ms
      from net._http_response r where r.id = u.request_id;
    if v_status is not null or v_ms is not null then
      insert into private.uptime_times (url, status, ms) values (coalesce(u.url, 'https://buildxhue.com/'), v_status, v_ms);
    end if;
    if coalesce(v_status, 0) between 200 and 399 then
      if u.alerted then
        perform private.notify_staff('report', 'الموقع رجع يشتغل ✅', 'buildxhue.com بيفتح تاني.', '/app/#/staff/security');
      end if;
      update private.uptime set failures = 0, alerted = false where id = 1;
      -- Speed: three slow answers in a row → one alert; fast again → one all-clear.
      if v_ms is not null and v_ms > 4000 then
        update private.uptime set slow = slow + 1 where id = 1;
        if u.slow + 1 >= 3 and not u.slow_alerted then
          perform private.notify_staff('report', 'الموقع بطيء 🐢',
            'آخر 3 فحوصات الصفحة اتأخرت أكتر من 4 ثواني (آخرها ' || round(v_ms / 1000.0, 1) || ' ث على ' || coalesce(u.url, '/') || ').', '/app/#/staff/security');
          update private.uptime set slow_alerted = true where id = 1;
        end if;
      elsif v_ms is not null then
        if u.slow_alerted then
          perform private.notify_staff('report', 'الموقع رجع سريع ⚡', 'آخر فحص ردّ في ' || round(v_ms / 1000.0, 1) || ' ثانية.', '/app/#/staff/security');
        end if;
        update private.uptime set slow = 0, slow_alerted = false where id = 1;
      end if;
    else
      update private.uptime set failures = failures + 1 where id = 1;
      if u.failures + 1 >= 2 and not u.alerted then
        perform private.notify_staff('report', 'الموقع مش بيفتح ⚠️',
          'buildxhue.com مردّش في آخر فحصين' || coalesce(' (كود ' || v_status || ')', '') || '. شوف GitHub Pages والدومين.', '/app/#/staff/security');
        update private.uptime set alerted = true where id = 1;
      end if;
    end if;
  end if;
  v_next := v_pages[1 + (extract(minute from now())::int / 10) % array_length(v_pages, 1)];
  update private.uptime
     set request_id = net.http_get(url := v_next, timeout_milliseconds := 15000), checked_at = now(), requested_at = clock_timestamp(), url = v_next
   where id = 1;
exception when others then
  null;
end $$;
revoke execute on function private.uptime_check() from public, anon, authenticated;

/** The site's answer times in the last day (security screen). */
create or replace function public.staff_uptime_times()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'median', (select percentile_cont(0.5) within group (order by ms) from private.uptime_times where at > now() - interval '24 hours' and ms is not null),
    'p90', (select percentile_cont(0.9) within group (order by ms) from private.uptime_times where at > now() - interval '24 hours' and ms is not null),
    'slow', (select count(*) from private.uptime_times where at > now() - interval '24 hours' and ms > 4000),
    'checks', (select count(*) from private.uptime_times where at > now() - interval '24 hours'),
    'last', (select jsonb_agg(jsonb_build_object('at', at, 'url', url, 'ms', ms, 'status', status) order by at desc)
               from (select * from private.uptime_times order by at desc limit 12) x));
end $$;
revoke all on function public.staff_uptime_times() from public, anon;
grant execute on function public.staff_uptime_times() to authenticated;
