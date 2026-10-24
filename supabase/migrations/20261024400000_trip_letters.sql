-- Official letters from the app: a bus request to the dean for an event's students, with the count
-- from the form or the event's registrations. Each form/event keeps its letter (event name, date,
-- venue, purpose…) so it prints the same next time; the people on every letter (who it's addressed
-- to, who signs) are kept once in «_settings». Only team members read them; staff who run forms,
-- events or the expo write them.

create table if not exists public.trip_letters (
  key text primary key check (key = '_settings' or key ~ '^(form|event):[0-9a-f-]{36}$'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.trip_letters enable row level security;
revoke all on public.trip_letters from anon, authenticated;

do $$ begin
if not exists (select 1 from pg_trigger where tgname = 'trip_letters_audit') then
  create trigger trip_letters_audit after insert or update on public.trip_letters for each row execute function private.audit();
end if;
end $$;

/** The letter for one form or event, and the shared settings (addressee, signatures). */
create or replace function public.staff_trip_letter(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', coalesce((select data from public.trip_letters where key = '_settings'), '{}'::jsonb),
    'letter', coalesce((select data from public.trip_letters where key = p_key and key <> '_settings'), '{}'::jsonb));
end $$;
revoke all on function public.staff_trip_letter(text) from public, anon;
grant execute on function public.staff_trip_letter(text) to authenticated;

/** Save a form's/event's letter, and the shared settings when given. */
create or replace function public.staff_trip_letter_save(p_key text, p_letter jsonb, p_settings jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.can('forms') or private.can('events') or private.can('expo')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key is null or p_key = '_settings' or p_key !~ '^(form|event):[0-9a-f-]{36}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into public.trip_letters (key, data, updated_at, updated_by) values (p_key, coalesce(p_letter, '{}'::jsonb), now(), auth.uid())
  on conflict (key) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  if p_settings is not null then
    insert into public.trip_letters (key, data, updated_at, updated_by) values ('_settings', p_settings, now(), auth.uid())
    on conflict (key) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  end if;
end $$;
revoke all on function public.staff_trip_letter_save(text, jsonb, jsonb) from public, anon;
grant execute on function public.staff_trip_letter_save(text, jsonb, jsonb) to authenticated;
