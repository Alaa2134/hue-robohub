-- Lists that go to conferences and partners are in English. Each response can keep the person's name
-- in English (spelled from the Arabic in the app, then checked by the team), so the next file uses
-- the checked spelling. The team saves the whole list in one call; an Arabic name changed later
-- clears its English spelling so it is spelled again.

alter table public.form_responses add column if not exists name_en text;

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'form_responses_name_en_ok') then
  alter table public.form_responses add constraint form_responses_name_en_ok
    check (name_en is null or (char_length(btrim(name_en)) between 1 and 120));
end if;
end $$;

create or replace function private.form_response_name_en()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name and new.name_en is not distinct from old.name_en then
    new.name_en := null;
  end if;
  return new;
end $$;
revoke all on function private.form_response_name_en() from public, anon, authenticated;

create or replace trigger form_responses_name_en before update of name on public.form_responses
  for each row execute function private.form_response_name_en();

/** {response id: English name} for one form; an empty name clears it. Returns how many changed. */
create or replace function public.staff_form_names_en(p_form uuid, p_names jsonb)
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
  if jsonb_typeof(p_names) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_names)) > 5000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update public.form_responses r
     set name_en = nullif(left(regexp_replace(btrim(x.value), '\s+', ' ', 'g'), 120), '')
    from jsonb_each_text(p_names) x
   where x.key ~ '^[0-9a-f-]{36}$'
     and r.id = x.key::uuid
     and r.form_id = p_form
     and r.name_en is distinct from nullif(left(regexp_replace(btrim(x.value), '\s+', ' ', 'g'), 120), '');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.staff_form_names_en(uuid, jsonb) from public, anon;
grant execute on function public.staff_form_names_en(uuid, jsonb) to authenticated;
