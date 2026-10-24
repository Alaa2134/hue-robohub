-- Trips with more than one bus: the team splits the people of a form into «أتوبيس 1», «أتوبيس 2»…
-- (kept as groups on each response, so the lists, filters, PDF and Excel already know them). One call
-- sets everyone's bus: {response id: bus number}, 0 takes someone off the buses. A person is only
-- ever on one bus.

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
                || case when x.bus > 0 then array['أتوبيس ' || x.bus] else '{}'::text[] end
    from (select key::uuid as id, value::int as bus from jsonb_each_text(p_buses)
           where key ~ '^[0-9a-f-]{36}$' and value ~ '^[0-9]{1,2}$') x
   where r.id = x.id and r.form_id = p_form;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.staff_form_set_buses(uuid, jsonb) from public, anon;
grant execute on function public.staff_form_set_buses(uuid, jsonb) to authenticated;
