-- After every event, by itself: a recap from the records (registered, came, the rating and how many
-- rated, the news post if one is out) is kept for the partners, shown on each partner's private page
-- (/partner?t=…), and emailed to partners whose contact is an email. Once per event, a few hours after
-- it ends, only for events people actually came to. Numbers only — nothing written by hand.

create table if not exists public.event_recaps (
  form_id uuid primary key references public.forms(id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
alter table public.event_recaps enable row level security;
revoke all on public.event_recaps from anon, authenticated;

create or replace function private.event_recap_data(p_form uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', coalesce(nullif(btrim(f.title_ar), ''), f.slug),
    'title_en', coalesce(nullif(btrim(f.title_en), ''), nullif(btrim(f.title_ar), ''), f.slug),
    'at', f.event_at,
    'registered', (select count(*) from public.form_responses r where r.form_id = f.id),
    'came', (select count(distinct a.response_id) from public.form_attendance a join public.form_responses r on r.id = a.response_id
              where r.form_id = f.id and a.present),
    'rating', (select round(avg(x.rating)::numeric, 1) from public.form_session_feedback x join public.form_responses r on r.id = x.response_id where r.form_id = f.id),
    'ratings', (select count(*) from public.form_session_feedback x join public.form_responses r on r.id = x.response_id where r.form_id = f.id),
    'post', (select p.slug from public.site_content p where p.kind = 'post' and p.published and ('event:form:' || f.id) = any (p.tags)
              order by p.created_at desc limit 1))
  from public.forms f where f.id = p_form
$$;
revoke all on function private.event_recap_data(uuid) from public, anon, authenticated;

create or replace function private.event_recaps_tick()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  f record;
  d jsonb;
  p record;
  n integer := 0;
begin
  for f in
    select fo.id from public.forms fo
     where not coalesce(fo.archived, false) and fo.delegation is null
       and fo.event_at between now() - interval '5 days' and now() - interval '6 hours'
       and not exists (select 1 from public.event_recaps r where r.form_id = fo.id)
  loop
    d := private.event_recap_data(f.id);
    continue when coalesce((d ->> 'came')::int, 0) = 0;
    insert into public.event_recaps (form_id, data) values (f.id, d) on conflict do nothing;
    if exists (select 1 from private.email_account where id = 1 and status = 'ok') then
      for p in select * from public.partners where active and private.email_ok(lower(btrim(contact))) loop
        begin
          perform private.email_queue(lower(btrim(p.contact)), p.name, 'BuildX HUE — ' || (d ->> 'title'),
            concat_ws(E'\n',
              'أهلًا ' || p.name || '،', '',
              'ملخص «' || (d ->> 'title') || '» من سجلاتنا:',
              '• سجّلوا: ' || (d ->> 'registered'),
              '• حضروا فعلًا: ' || (d ->> 'came'),
              case when (d ->> 'ratings')::int > 0 then '• تقييم الحضور: ' || (d ->> 'rating') || ' من 5 (' || (d ->> 'ratings') || ' تقييم)' end,
              case when d ->> 'post' is not null then '• الخبر: https://buildxhue.com/ar/news/' || (d ->> 'post') || '/' end,
              '', 'كل الفعاليات والتقارير الموثّقة في صفحتكم: https://buildxhue.com/ar/partner/?t=' || p.token,
              '', 'شكرًا لدعمكم 🤝', 'فريق BuildX HUE'),
            'auto', 'event_recap', 'event_recap:' || f.id, null, true);
        exception when others then null;
        end;
      end loop;
      update public.event_recaps set emailed_at = now() where form_id = f.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.event_recaps_tick() from public, anon, authenticated;

-- The partner's page lists the recaps of the last 6 months.
select private.patch_function('public.partner_portal(text)',
  $f$return jsonb_build_object('ok', true, 'found', true, 'name', p.name,$f$,
  $f$return jsonb_build_object('ok', true, 'found', true, 'name', p.name,
    'events', coalesce((select jsonb_agg(r.data order by (r.data ->> 'at') desc)
                          from public.event_recaps r where r.created_at > now() - interval '6 months'), '[]'),$f$);

select cron.schedule('buildx-event-recaps', '37 * * * *', 'select private.event_recaps_tick()');
