-- Sectors and team tasks, part 2: overseers create and edit sectors.

/** Overseers: create or edit a sector (name, description, colour, archived). */
create or replace function public.staff_sector_save(p_id uuid, p_name text, p_description text, p_color text, p_archived boolean default false) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.sectors (name, description, color)
    values (btrim(p_name), coalesce(btrim(p_description), ''), coalesce(p_color, '#2f7bff'))
    returning id into v_id;
  else
    update public.sectors set name = btrim(p_name), description = coalesce(btrim(p_description), ''),
           color = coalesce(p_color, color), archived = coalesce(p_archived, false)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $$;
