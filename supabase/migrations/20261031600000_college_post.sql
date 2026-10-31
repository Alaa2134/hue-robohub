-- The college's post after an event (media desk): the college's patronage/supervision lines and
-- who it is, saved once in site_settings 'college_post' (the names live in the database, not here),
-- and who was scanned in at an event, to list who represented the college.

create or replace function public.staff_college_setup()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('site') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select value from public.site_settings where key = 'college_post'), '{}');
end $$;

create or replace function public.staff_college_setup_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not private.can('site') then raise exception 'forbidden' using errcode = '42501'; end if;
  v := jsonb_build_object(
    'header', left(coalesce(p ->> 'header', ''), 2000),
    'students', left(coalesce(p ->> 'students', ''), 200),
    'college', left(coalesce(p ->> 'college', ''), 200),
    'university', left(coalesce(p ->> 'university', ''), 120),
    'field', left(coalesce(p ->> 'field', ''), 200),
    'supervisor', left(coalesce(p ->> 'supervisor', ''), 300));
  insert into public.site_settings (key, value) values ('college_post', v)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end $$;

/** Who came to a form's event (scanned in at any session but the bus), in the order they arrived. */
create or replace function public.staff_event_people(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_form uuid;
begin
  if not private.can_read('site') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key !~ '^form:[0-9a-f-]{36}$' then return '[]'; end if;
  v_form := substring(p_key from 6)::uuid;
  return coalesce((
    select jsonb_agg(x.name order by x.first_at)
      from (select btrim(r.name) as name, min(a.at) as first_at
              from public.form_attendance a join public.form_responses r on r.id = a.response_id
             where r.form_id = v_form and a.present and a.session not like 'bus\_%' and nullif(btrim(r.name), '') is not null
             group by r.id, r.name) x), '[]');
end $$;

revoke all on function public.staff_college_setup(), public.staff_college_setup_save(jsonb), public.staff_event_people(text) from public, anon;
grant execute on function public.staff_college_setup(), public.staff_college_setup_save(jsonb), public.staff_event_people(text) to authenticated;
