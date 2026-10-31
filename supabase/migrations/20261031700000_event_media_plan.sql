-- The media plan runs itself. For every event (a form with an event date), the media sector gets its
-- tasks on their own, each with its deadline and the people in the sector on it:
--   * the announcement post a week before   * a reminder a day before
--   * the photos on the day                 * after it: the site's news, the college post, the carousel
-- (a step whose deadline has already passed when the event is first seen is skipped). The posts
-- themselves are written by the media desk; the tasks point there. And the tasks close themselves:
-- the photos one as soon as the event's photos are on the site, the after one as soon as its news
-- post is saved. Auto tasks give no warning when missed. Off with site_settings 'media_plan'
-- {"enabled": false}; the sector is {"sector": "<id>"} or the one named media / ميديا.

create table if not exists private.event_media_tasks (
  event_key text not null,
  step text not null check (step in ('promo', 'reminder', 'photos', 'after')),
  task_id uuid references public.staff_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_key, step)
);
create index if not exists event_media_tasks_task on private.event_media_tasks (task_id);

create or replace function private.media_sector() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.id from public.site_settings x join public.sectors s on s.id::text = x.value ->> 'sector' and not s.archived where x.key = 'media_plan'),
    (select s.id from public.sectors s where not s.archived and s.name ~* '(ميديا|media|إعلام|اعلام)' order by s.created_at limit 1))
$$;

create or replace function private.event_media_plan() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_sector uuid := private.media_sector();
  v_people uuid[];
  v_task uuid;
  e record;
  s record;
  n integer := 0;
begin
  if not coalesce((select (value ->> 'enabled')::boolean from public.site_settings where key = 'media_plan'), true) or v_sector is null then
    return 0;
  end if;
  v_people := array(select m.staff_id from public.sector_members m join public.staff x on x.user_id = m.staff_id and x.active
                     where m.sector_id = v_sector and m.active);
  if coalesce(cardinality(v_people), 0) = 0 then return 0; end if;

  -- New tasks for events coming up (or just over).
  for e in
    select 'form:' || f.id as key, left(btrim(coalesce(nullif(btrim(f.title_ar), ''), f.slug)), 100) as title, f.event_at as at
      from public.forms f
     where not coalesce(f.archived, false) and f.event_at between now() - interval '2 days' and now() + interval '45 days'
  loop
    for s in
      select * from (values
        ('promo', e.at - interval '7 days', 'بوست الإعلان: ', 'normal',
         'البوست مكتوب جاهز في مكتب الميديا (فيسبوك، إنستجرام، لينكدإن وقناة الواتساب) — انسخه وانشره.'),
        ('reminder', e.at - interval '1 day', 'تذكير بكرة: ', 'normal',
         'ستوري أو بوست تذكير قبلها بيوم — النص جاهز في مكتب الميديا.'),
        ('photos', e.at + interval '6 hours', 'صور: ', 'high',
         'صوّر الفعالية وارفع الصور من «صور في البرواز» في ألبوم باسم الفعالية. التاسك بيتقفل لوحده أول ما الصور تتنشر على الموقع.'),
        ('after', e.at + interval '1 day', 'بعد الفعالية: ', 'high',
         'من مكتب الميديا: خبر الموقع، وبوست الكلية، والكاروسيل. التاسك بيتقفل لوحده أول ما خبر الموقع يتحفظ.')
      ) as t(step, due, prefix, prio, body)
    loop
      continue when exists (select 1 from private.event_media_tasks m where m.event_key = e.key and m.step = s.step);
      -- Too late to plan this step (an event added late): skip it rather than set a deadline that's gone.
      continue when s.due < now() + interval '2 hours';
      insert into public.staff_tasks (sector_id, title, description, link, priority, due_at, warn_on_miss, created_by)
      values (v_sector, left(s.prefix || e.title, 140), s.body, 'https://buildxhue.com/app/#/staff/media', s.prio, s.due, false, null)
      returning id into v_task;
      insert into public.staff_task_assignees (task_id, staff_id, reminded_at)
      select v_task, p, case when s.due < now() + interval '1 day' then now() end from unnest(v_people) as p;
      insert into private.event_media_tasks (event_key, step, task_id) values (e.key, s.step, v_task);
      perform private.notify_staff_users(v_people, 'تاسك جديد: ' || left(s.prefix || e.title, 140),
        'الميديا · آخر ميعاد ' || to_char(s.due at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), '/app/#/staff/mytasks');
      n := n + 1;
    end loop;
  end loop;

  -- Tasks whose work is done close themselves.
  for s in
    select m.task_id, m.step, m.event_key, f.title_ar, f.slug
      from private.event_media_tasks m
      join public.staff_tasks t on t.id = m.task_id and t.status = 'open'
      join public.forms f on 'form:' || f.id = m.event_key
     where (m.step = 'photos' and exists (select 1 from public.site_content p where p.kind = 'photo' and p.published
                                           and btrim(coalesce(nullif(btrim(f.title_ar), ''), f.slug)) = any (select btrim(x) from unnest(p.tags) x)))
        or (m.step = 'after' and exists (select 1 from public.site_content p where p.kind = 'post' and ('event:' || m.event_key) = any (p.tags)))
  loop
    update public.staff_task_assignees
       set state = 'approved', submitted_at = coalesce(submitted_at, now()), reviewed_at = now(),
           note = coalesce(note, case when s.step = 'photos' then 'اتقفل لوحده: صور الفعالية اتنشرت على الموقع.' else 'اتقفل لوحده: خبر الفعالية اتحفظ.' end)
     where task_id = s.task_id and state <> 'approved';
    update public.staff_tasks set status = 'closed' where id = s.task_id;
  end loop;
  return n;
end $$;

revoke all on function private.media_sector(), private.event_media_plan() from public, anon, authenticated;

-- Every hour at :53 (a quiet minute).
select cron.schedule('buildx-media-plan', '53 * * * *', 'select private.event_media_plan()');
