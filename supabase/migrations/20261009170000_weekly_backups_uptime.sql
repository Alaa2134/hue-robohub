-- Ops:
--   Weekly backups: next to the seven nightly ones, a copy every Saturday night kept for eight weeks
--   (slots 8–15), so a mistake noticed weeks later can still be undone. Owners download them in the app.
--   Site-down alert: every 10 minutes the database opens buildxhue.com; after two failures in a row the
--   owners and admins get a notification, and another when it's back.

alter table private.backups drop constraint if exists backups_slot_check;
alter table private.backups add constraint backups_slot_check check (slot between 0 and 15);

select cron.unschedule(jobid) from cron.job where jobname = 'buildx-weekly-backup';
-- Saturday 23:41 Cairo (21:41 UTC), into one of eight rolling weekly slots.
select cron.schedule('buildx-weekly-backup', '41 21 * * 6', $$select private.take_backup((8 + extract(week from now())::int % 8)::smallint)$$);

create table if not exists private.uptime (
  id int primary key default 1 check (id = 1),
  request_id bigint,
  failures int not null default 0,
  alerted boolean not null default false,
  checked_at timestamptz
);
insert into private.uptime (id) values (1) on conflict do nothing;

create or replace function private.uptime_check() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u private.uptime%rowtype;
  v_status int;
begin
  select * into u from private.uptime where id = 1 for update;
  -- The answer to the previous check (pg_net is asynchronous).
  if u.request_id is not null then
    select r.status_code into v_status from net._http_response r where r.id = u.request_id;
    if coalesce(v_status, 0) between 200 and 399 then
      if u.alerted then
        perform private.notify_staff('report', 'الموقع رجع يشتغل ✅', 'buildxhue.com بيفتح تاني.', '/app/#/staff/security');
      end if;
      update private.uptime set failures = 0, alerted = false where id = 1;
    else
      update private.uptime set failures = failures + 1 where id = 1;
      if u.failures + 1 >= 2 and not u.alerted then
        perform private.notify_staff('report', 'الموقع مش بيفتح ⚠️',
          'buildxhue.com مردّش في آخر فحصين' || coalesce(' (كود ' || v_status || ')', '') || '. شوف GitHub Pages والدومين.', '/app/#/staff/security');
        update private.uptime set alerted = true where id = 1;
      end if;
    end if;
  end if;
  update private.uptime
     set request_id = net.http_get(url := 'https://buildxhue.com/', timeout_milliseconds := 15000), checked_at = now()
   where id = 1;
exception when others then
  null;
end $$;
revoke execute on function private.uptime_check() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'buildx-uptime';
select cron.schedule('buildx-uptime', '*/10 * * * *', $$select private.uptime_check()$$);
