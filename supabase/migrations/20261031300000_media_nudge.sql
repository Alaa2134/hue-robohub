-- The media desk reminds the team by itself: a few hours after an event ends, whoever handles the
-- website gets one notification that its news post and social posts are written and waiting in the
-- media desk. Once per event, only while it has no post, and only for events people came to.

create table if not exists private.media_nudges (
  key text primary key,
  at timestamptz not null default now()
);

create or replace function private.media_nudge()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e record;
  n integer := 0;
begin
  for e in
    select 'form:' || f.id as key, btrim(coalesce(nullif(btrim(f.title_ar), ''), f.slug)) as title,
           (select count(distinct a.response_id) from public.form_attendance a join public.form_responses r on r.id = a.response_id
             where r.form_id = f.id and a.present) as came
      from public.forms f
     where not coalesce(f.archived, false) and f.delegation is null
       and f.event_at between now() - interval '3 days' and now() - interval '3 hours'
  loop
    continue when e.came = 0
      or exists (select 1 from public.site_content p where p.kind = 'post' and ('event:' || e.key) = any (p.tags));
    insert into private.media_nudges (key) values (e.key) on conflict do nothing;
    continue when not found;
    perform private.notify_staff('site', 'خبر «' || left(e.title, 60) || '» جاهز 📝',
      'الفعالية خلصت وحضرها ' || e.came || '. الخبر وبوستات السوشيال اتكتبوا من أرقامها في مكتب الميديا — راجع وانشر.',
      '/app/#/staff/media');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.media_nudge() from public, anon, authenticated;

-- Every hour at :41 (quiet minute).
select cron.schedule('buildx-media-nudge', '41 * * * *', 'select private.media_nudge()');
