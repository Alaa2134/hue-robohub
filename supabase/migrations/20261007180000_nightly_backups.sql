-- Nightly snapshots of the community's data, one per weekday (seven rolling copies, each overwritten a
-- week later). Owners can download any of them as JSON from the BuildX App or take one on demand.
-- Student PINs, sessions and other secrets are not included.

create table private.backups (
  slot smallint primary key check (slot between 0 and 7),
  taken_at timestamptz not null default now(),
  counts jsonb not null default '{}',
  data jsonb not null
);

create or replace function private.take_backup(p_slot smallint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_data jsonb;
  v_counts jsonb;
begin
  v_data := jsonb_build_object(
    'version', 1,
    'taken_at', now(),
    'staff', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.staff t),
    'students', (select coalesce(jsonb_agg(to_jsonb(t) - 'code_key' - 'barcode_key'), '[]') from public.students t),
    'attendance_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.attendance_sessions t),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.attendance t),
    'materials', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.materials t),
    'quizzes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.quizzes t),
    'quiz_questions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.quiz_questions t),
    'quiz_attempts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.quiz_attempts t),
    'applications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.applications t),
    'site_content', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_content t),
    'site_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_settings t),
    'team_profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.team_profiles t),
    'team_projects', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.team_projects t),
    'certificates', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.certificates t),
    'event_registrations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.event_registrations t),
    'student_bonus', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.student_bonus t)
  );
  select jsonb_object_agg(k, jsonb_array_length(v)) into v_counts from jsonb_each(v_data) as e(k, v) where jsonb_typeof(v) = 'array';
  insert into private.backups (slot, taken_at, counts, data) values (p_slot, now(), v_counts, v_data)
  on conflict (slot) do update set taken_at = excluded.taken_at, counts = excluded.counts, data = excluded.data;
  return v_counts;
end $$;

/** Owners: list the snapshots (slot 7 is the on-demand one). */
create or replace function public.staff_backups() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'taken_at', taken_at, 'counts', counts, 'bytes', pg_column_size(data)) order by taken_at desc) from private.backups), '[]');
end $$;

/** Owners: one snapshot's full data, to save as a file. */
create or replace function public.staff_backup_download(p_slot int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select data from private.backups where slot = p_slot);
end $$;

/** Owners: take a snapshot right now (kept in its own slot). */
create or replace function public.staff_backup_now() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.take_backup(7::smallint);
end $$;

revoke execute on function private.take_backup(smallint) from public, anon, authenticated;
revoke execute on function public.staff_backups(), public.staff_backup_download(int), public.staff_backup_now() from public, anon;
grant execute on function public.staff_backups(), public.staff_backup_download(int), public.staff_backup_now() to authenticated;

-- Every night at 02:23 Cairo time (00:23 UTC), into today's weekday slot.
select cron.schedule('buildx-nightly-backup', '23 0 * * *', $$select private.take_backup(extract(dow from now() at time zone 'Africa/Cairo')::smallint)$$);
