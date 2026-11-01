-- One gentle reminder for someone who started the join form and stopped: after the first step the
-- form tells the database the phone (and email) it was given; about a day later, if no application
-- came from that phone or email and applications are still open, one WhatsApp (approved template
-- bx_registration_incomplete_v4) and one email go out, in daytime Cairo hours. Never a second one.

create table if not exists private.join_started (
  phone text primary key,
  email text,
  name text,
  locale text not null default 'ar',
  started_at timestamptz not null default now(),
  nudged_at timestamptz
);
alter table private.join_started enable row level security;
revoke all on private.join_started from public, anon, authenticated;

create or replace function public.join_started(p_phone text, p_email text default null, p_name text default null, p_locale text default 'ar')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.wa_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_phone is null then return; end if;
  if not private.throttle('join_started', 10, interval '10 minutes') then return; end if;
  if v_email is not null and not private.email_ok(v_email) then v_email := null; end if;
  insert into private.join_started (phone, email, name, locale)
  values (v_phone, v_email, left(nullif(btrim(coalesce(p_name, '')), ''), 120), case when p_locale = 'en' then 'en' else 'ar' end)
  on conflict (phone) do update
    set email = coalesce(excluded.email, private.join_started.email),
        name = coalesce(excluded.name, private.join_started.name),
        started_at = case when private.join_started.nudged_at is null then excluded.started_at else private.join_started.started_at end;
end $$;
revoke all on function public.join_started(text, text, text, text) from public;
grant execute on function public.join_started(text, text, text, text) to anon, authenticated;

insert into private.wa_auto_rules (key, section, sort, label_ar, hint_ar, vars_ar, template, lang, enabled, bulk, enabled_at)
values ('join_resume', 'join', 90, 'تذكير اللي بدأ يقدّم ووقف',
        'رسالة واحدة بس، بعد حوالي يوم، للي كتب رقمه في فورم الانضمام ومكمّلش — لو التقديم لسه مفتوح، وفي ساعات النهار.',
        'من غير متغيرات', 'bx_registration_incomplete_v4', 'ar', true, false, now())
on conflict (key) do nothing;

create or replace function private.join_resume_tick()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
  v_hour int := extract(hour from now() at time zone 'Africa/Cairo');
begin
  if v_hour < 10 or v_hour >= 21 then return 0; end if;
  if coalesce((select (value ->> 'open')::boolean from public.site_settings where key = 'applications'), true) is not true then return 0; end if;
  for r in
    select j.* from private.join_started j
     where j.nudged_at is null
       and j.started_at between now() - interval '3 days' and now() - interval '20 hours'
       and not exists (select 1 from public.applications a
                        where private.wa_phone(a.phone) = j.phone or (j.email is not null and lower(a.email) = j.email))
     order by j.started_at
     limit 40
  loop
    update private.join_started set nudged_at = now() where phone = r.phone;
    perform private.wa_auto('join_resume', r.phone, r.name, '[]'::jsonb, 'join_resume:' || r.phone);
    if r.email is not null and exists (select 1 from private.email_account where id = 1 and status = 'ok') then
      begin
        perform private.email_queue(r.email, r.name,
          case when r.locale = 'en' then 'Your BuildX HUE application is waiting' else 'طلب انضمامك لـ BuildX HUE مستنيك' end,
          case when r.locale = 'en'
               then 'Hi' || coalesce(' ' || split_part(r.name, ' ', 1), '') || E',\n\nYou started applying to BuildX HUE and stopped halfway. If you still want to join, it takes a few minutes:\nhttps://buildxhue.com/join/\n\nIf you already applied, ignore this message. We won''t remind you again.\n\nBuildX HUE'
               else 'أهلًا' || coalesce(' ' || split_part(r.name, ' ', 1), '') || E'،\n\nبدأت تقدّم في أسرة BuildX HUE ووقفت في النص. لو لسه عايز تنضم، هياخد منك دقايق:\nhttps://buildxhue.com/ar/join/\n\nلو قدّمت خلاص تجاهل الرسالة دي، ومش هنفكّرك تاني.\n\nفريق BuildX HUE' end,
          'auto', 'join_resume', 'join_resume:' || r.phone, null, true);
      exception when others then null;
      end;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.join_resume_tick() from public, anon, authenticated;

select cron.schedule('buildx-join-resume', '23 * * * *', 'select private.join_resume_tick()');
