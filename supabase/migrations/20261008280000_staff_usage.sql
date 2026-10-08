-- How much of the free plan the project uses (database size, stored files per bucket), for owners and
-- admins: the app shows it against the free limits (500 MB database, 1 GB files).
create or replace function public.staff_usage() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'bytes', b.bytes, 'files', b.files) order by b.bytes desc)
        from (select bucket_id, sum(coalesce((metadata ->> 'size')::bigint, 0)) as bytes, count(*) as files
                from storage.objects group by bucket_id) b
    ), '[]'::jsonb));
end $$;
revoke execute on function public.staff_usage() from public, anon;
grant execute on function public.staff_usage() to authenticated;
