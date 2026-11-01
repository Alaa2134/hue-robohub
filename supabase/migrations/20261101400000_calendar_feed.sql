-- Public events for the calendar feed (supabase/functions/calendar): published events from 60 days
-- back to a year ahead, in Arabic or English. Public data only.
create or replace function public.calendar_events(p_lang text default 'ar')
returns table (id uuid, slug text, title text, summary text, location text, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug,
         case when p_lang = 'en' then coalesce(nullif(btrim(c.title), ''), c.title_ar) else coalesce(nullif(btrim(c.title_ar), ''), c.title) end,
         case when p_lang = 'en' then coalesce(nullif(btrim(c.summary), ''), c.summary_ar, '') else coalesce(nullif(btrim(c.summary_ar), ''), c.summary, '') end,
         case when p_lang = 'en' then coalesce(nullif(btrim(c.location), ''), c.location_ar, '') else coalesce(nullif(btrim(c.location_ar), ''), c.location, '') end,
         c.starts_at, c.ends_at, c.updated_at
    from public.site_content c
   where c.kind = 'event' and c.published and c.starts_at is not null
     and (c.publish_at is null or c.publish_at <= now())
     and c.starts_at between now() - interval '60 days' and now() + interval '365 days'
   order by c.starts_at
   limit 300
$$;
revoke all on function public.calendar_events(text) from public;
grant execute on function public.calendar_events(text) to anon, authenticated;
