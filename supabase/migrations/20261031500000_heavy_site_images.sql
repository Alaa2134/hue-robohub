-- Site photos uploaded from iPhones were saved as heavy JPEGs (Safari can't write WebP), about 600 KB
-- each. The app now keeps them light; this lists the heavy ones so the team can shrink them in one
-- tap (re-encoded on the device, saved under a new name, the old files removed). Only photos used by
-- exactly one content item's picture and nowhere else (pages, page versions, settings) are listed.

create or replace function public.staff_heavy_site_images(p_min bigint default 320000)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can('site') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'path', o.name, 'size', (o.metadata ->> 'size')::bigint) order by (o.metadata ->> 'size')::bigint desc)
      from storage.objects o
      join public.site_content c on c.image_path = o.name
     where o.bucket_id = 'site' and o.name ~ '\.w\.(jpg|webp)$'
       and (o.metadata ->> 'size')::bigint >= greatest(p_min, 100000)
       and (select count(*) from public.site_content c2 where c2.image_path = o.name) = 1
       and not exists (select 1 from public.site_content c3 where c3.id <> c.id and c3::text like '%' || o.name || '%')
       and not exists (select 1 from public.site_pages p where p::text like '%' || o.name || '%')
       and not exists (select 1 from public.site_page_versions v where v::text like '%' || o.name || '%')
       and not exists (select 1 from public.site_settings s where s.value::text like '%' || o.name || '%')), '[]');
end $$;

revoke all on function public.staff_heavy_site_images(bigint) from public, anon;
grant execute on function public.staff_heavy_site_images(bigint) to authenticated;
