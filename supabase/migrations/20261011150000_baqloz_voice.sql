-- Baqloz in a person's own voice. A team member with the "voice" permission records one of his lines
-- in the app (or uploads an audio file of it), and the site plays that recording instead of the
-- generated voice. The files are public in the "voice" bucket (<line key>/<time>.wav), and
-- public.voice_clips says which file is current for each line. Turning a recording off brings the
-- generated voice back for that line; nothing is removed.

create table if not exists public.voice_clips (
  key text primary key check (key ~ '^[0-9a-f]{8}$'),
  line text not null check (char_length(line) between 1 and 600),
  path text not null check (path ~ '^[0-9a-f]{8}/[0-9]{10,16}\.(wav|mp3|m4a)$'),
  seconds numeric(5, 2) check (seconds is null or seconds between 0 and 60),
  active boolean not null default true,
  recorded_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.voice_clips enable row level security;
create policy voice_clips_select on public.voice_clips for select to authenticated using ((select private.can('voice')));
create policy voice_clips_insert on public.voice_clips for insert to authenticated with check ((select private.can('voice')));
create policy voice_clips_update on public.voice_clips for update to authenticated
  using ((select private.can('voice'))) with check ((select private.can('voice')));
revoke all on public.voice_clips from anon;
grant select, insert, update on public.voice_clips to authenticated;

/** Who recorded it and when, on every change. */
create or replace function private.voice_clip_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  return new;
end $$;
revoke execute on function private.voice_clip_touch() from public, anon, authenticated;
create trigger voice_clips_touch before insert or update on public.voice_clips
  for each row execute function private.voice_clip_touch();

/** Public: the lines recorded in a person's voice (line key → file in the "voice" bucket). */
create or replace function public.voice_clips_live() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, path), '{}'::jsonb) from public.voice_clips where active
$$;
revoke execute on function public.voice_clips_live() from public;
grant execute on function public.voice_clips_live() to anon, authenticated;

-- The recordings: anyone can play them by URL; only the voice permission adds new ones.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', true, 3145728, array['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4'])
on conflict (id) do nothing;

create policy voice_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'voice' and (select private.can('voice')));
create policy voice_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'voice' and (select private.can('voice')));
