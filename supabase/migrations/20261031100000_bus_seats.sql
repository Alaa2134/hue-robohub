-- Seats on the bus: once a trip's people are split into buses («أتوبيس 1»…), the team places each one
-- on a seat of that bus (the seat map in the event file). The seat is a number on the response, kept
-- only while the person stays on the same bus, and shown on their QR page with the bus.

alter table public.form_responses add column if not exists seat smallint check (seat between 1 and 99);

/** Set seats for one form: {response id: seat number}, 0 takes someone off their seat. */
create or replace function public.staff_form_set_seats(p_form uuid, p_seats jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  n integer;
begin
  select * into f from public.forms where id = p_form;
  if not found then return 0; end if;
  if not (private.can('forms') or (private.can('expo') and f.delegation is not null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_seats) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_seats)) > 5000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update public.form_responses r
     set seat = nullif(x.seat, 0)
    from (select key::uuid as id, value::int as seat from jsonb_each_text(p_seats)
           where key ~ '^[0-9a-f-]{36}$' and value ~ '^[0-9]{1,2}$') x
   where r.id = x.id and r.form_id = p_form and r.seat is distinct from nullif(x.seat, 0);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.staff_form_set_seats(uuid, jsonb) from public, anon;
grant execute on function public.staff_form_set_seats(uuid, jsonb) to authenticated;

/** Splitting into buses again: whoever changes bus loses their old seat (it was on the other bus). */
create or replace function public.staff_form_set_buses(p_form uuid, p_buses jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  n integer;
begin
  select * into f from public.forms where id = p_form;
  if not found then return 0; end if;
  if not (private.can('forms') or (private.can('expo') and f.delegation is not null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_buses) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_buses)) > 5000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update public.form_responses r
     set tags = array(select t from unnest(r.tags) t where t !~ '^أتوبيس [0-9]+$')
                || case when x.bus > 0 then array['أتوبيس ' || x.bus] else '{}'::text[] end,
         seat = case when (select t from unnest(r.tags) t where t ~ '^أتوبيس [0-9]+$' limit 1)
                          is not distinct from case when x.bus > 0 then 'أتوبيس ' || x.bus end
                     then r.seat end
    from (select key::uuid as id, value::int as bus from jsonb_each_text(p_buses)
           where key ~ '^[0-9a-f-]{36}$' and value ~ '^[0-9]{1,2}$') x
   where r.id = x.id and r.form_id = p_form;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.staff_form_set_buses(uuid, jsonb) from public, anon;
grant execute on function public.staff_form_set_buses(uuid, jsonb) to authenticated;

/** The QR page also says which bus and seat (when the team placed them). */
create or replace function public.form_pass(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_pass', 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from public.form_responses where pass = upper(btrim(coalesce(p_token, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into f from public.forms where id = r.form_id;
  if not coalesce((f.attendance ->> 'on')::boolean, false) or f.archived then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'pass', r.pass, 'ref', r.ref, 'name', r.name, 'status', r.status,
    'title_ar', f.title_ar, 'title_en', f.title_en,
    'bus', (select substring(t from '^أتوبيس ([0-9]+)$')::int from unnest(r.tags) t where t ~ '^أتوبيس [0-9]+$' limit 1),
    'seat', case when exists (select 1 from unnest(r.tags) t where t ~ '^أتوبيس [0-9]+$') then r.seat end,
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', s ->> 'id', 'name', s ->> 'name', 'at', nullif(s ->> 'at', ''),
                                                              'here', coalesce(a.present, false), 'here_at', case when a.present then a.at end, 'rating', fb.rating, 'comment', fb.comment)
                                           order by n), '[]')
                   from jsonb_array_elements(private.form_sessions(f.attendance)) with ordinality x(s, n)
                   left join public.form_attendance a on a.response_id = r.id and a.session = s ->> 'id'
                   left join public.form_session_feedback fb on fb.response_id = r.id and fb.session = s ->> 'id'
                  where private.form_session_for(f.attendance, s, r.answers)));
end $$;
