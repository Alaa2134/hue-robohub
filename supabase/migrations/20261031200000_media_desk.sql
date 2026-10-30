-- The media desk: every event of the last two months and the next six weeks with its real numbers
-- (registered, accepted, who actually came, sessions, a bus trip or not, ratings), its photos on the site, and whether
-- a news post was already made for it. The app writes the news post and the social captions from
-- these numbers with fixed rules (no AI); a post made from the desk carries the tag 'event:<key>'.

create or replace function public.staff_media_desk()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('site') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    with ev as (
      -- Forms that are events: a date, or QR attendance that was used.
      select 'form:' || f.id as key, f.id as form_id, f.slug, coalesce(nullif(btrim(f.title_ar), ''), f.slug) as title, f.title_en,
             coalesce(f.event_at, (select min(a.at) from public.form_attendance a join public.form_responses r on r.id = a.response_id where r.form_id = f.id and a.present)) as at,
             (select e.location_ar from public.site_content e where e.kind = 'event' and e.form_id = f.id limit 1) as place,
             f.intro_ar as intro
        from public.forms f
       where not coalesce(f.archived, false) and f.delegation is null
         and (f.event_at is not null or exists (select 1 from public.form_attendance a join public.form_responses r on r.id = a.response_id where r.form_id = f.id and a.present))
      union all
      -- Website events with no form behind them.
      select 'event:' || e.id, null, e.slug, coalesce(nullif(btrim(e.title_ar), ''), e.title), e.title, e.starts_at, e.location_ar, e.summary_ar
        from public.site_content e
       where e.kind = 'event' and e.form_id is null and e.starts_at is not null
    )
    select jsonb_agg(jsonb_build_object(
             'key', ev.key, 'slug', ev.slug, 'title', btrim(ev.title), 'title_en', ev.title_en, 'at', ev.at, 'place', ev.place, 'intro', left(ev.intro, 1200),
             'registered', (select count(*) from public.form_responses r where r.form_id = ev.form_id and r.status::text <> 'rejected'),
             'accepted', (select count(*) from public.form_responses r where r.form_id = ev.form_id and r.status::text = 'accepted'),
             'attended', (select count(distinct a.response_id) from public.form_attendance a join public.form_responses r on r.id = a.response_id
                           where r.form_id = ev.form_id and a.present),
             -- Sessions of the event itself (bus boarding checks aren't sessions), and whether they went by bus.
             'sessions', (select count(distinct a.session) from public.form_attendance a join public.form_responses r on r.id = a.response_id
                           where r.form_id = ev.form_id and a.present and a.session not like 'bus\_%'),
             'bus', exists (select 1 from public.form_attendance a join public.form_responses r on r.id = a.response_id
                             where r.form_id = ev.form_id and a.present and a.session like 'bus\_%'),
             'rating', (select round(avg(fb.rating)::numeric, 1) from public.form_session_feedback fb join public.form_responses r on r.id = fb.response_id where r.form_id = ev.form_id),
             'ratings', (select count(*) from public.form_session_feedback fb join public.form_responses r on r.id = fb.response_id where r.form_id = ev.form_id),
             'photos', (select count(*) from public.site_content p where p.kind = 'photo' and p.published
                          and exists (select 1 from unnest(p.tags) t where btrim(t) = btrim(ev.title))),
             'cover', (select p.image_path from public.site_content p where p.kind = 'photo' and p.published and p.image_path is not null
                          and exists (select 1 from unnest(p.tags) t where btrim(t) = btrim(ev.title)) order by p.sort_order, p.created_at limit 1),
             'post', (select jsonb_build_object('id', p.id, 'published', p.published, 'slug', p.slug) from public.site_content p
                       where p.kind = 'post' and ('event:' || ev.key) = any (p.tags) order by p.created_at desc limit 1))
           order by ev.at desc)
      from ev
     where ev.at between now() - interval '60 days' and now() + interval '45 days'), '[]');
end $$;

revoke all on function public.staff_media_desk() from public, anon;
grant execute on function public.staff_media_desk() to authenticated;
