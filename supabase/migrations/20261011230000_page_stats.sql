-- Numbers for one page made in the page builder: visits and visitors a day, where they came from,
-- phone or computer, and for each form on the page how many applied (in the period and in all) and
-- how many were accepted. Visits to /p/<slug> are counted under their own path from now on (the site
-- sends the page's name with the view).

create or replace function public.staff_page_stats(p_slug text, p_forms text[] default null, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_from date := current_date - greatest(1, least(coalesce(p_days, 30), 365)) + 1;
  v_paths text[];
  v_forms text[];
begin
  if not private.can_read('pages') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  v_paths := case when v_slug = 'robotex' then array['/ar/robotex/', '/robotex/'] else array['/ar/p/' || v_slug || '/', '/p/' || v_slug || '/'] end;
  v_forms := coalesce(p_forms[1:5], array(
    select distinct b ->> 'form' from public.site_pages p, jsonb_array_elements(p.blocks) b
     where p.slug = v_slug and b ->> 'type' = 'form' and coalesce(b ->> 'form', '') <> ''));
  return jsonb_build_object(
    'from', v_from,
    'views', (select count(*) from private.page_views where path = any(v_paths) and day >= v_from),
    'visitors', (select count(distinct visitor) from private.page_views where path = any(v_paths) and day >= v_from),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'views', n) order by d)
                         from (select day as d, count(*) as n from private.page_views where path = any(v_paths) and day >= v_from group by day) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('host', h, 'views', n) order by n desc)
                             from (select coalesce(nullif(referrer, ''), '') as h, count(*) as n from private.page_views
                                    where path = any(v_paths) and day >= v_from group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_object_agg(coalesce(device, '?'), n)
                           from (select device, count(*) as n from private.page_views where path = any(v_paths) and day >= v_from group by 1) x), '{}'::jsonb),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title_ar,
                         'total', (select count(*) from public.form_responses r where r.form_id = f.id),
                         'period', (select count(*) from public.form_responses r where r.form_id = f.id and r.created_at >= v_from),
                         'accepted', (select count(*) from public.form_responses r where r.form_id = f.id and r.status = 'accepted')))
                       from public.forms f where f.slug = any(v_forms)), '[]'::jsonb));
end $$;
revoke execute on function public.staff_page_stats(text, text[], int) from public, anon;
grant execute on function public.staff_page_stats(text, text[], int) to authenticated;
