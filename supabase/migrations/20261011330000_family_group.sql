-- The family's WhatsApp group: its invite link is kept private (site_settings can be read by anyone) and
-- handed only to a student who has just registered (submit_family answers with it), and to staff.
create table if not exists private.family_private (
  id smallint primary key default 1 check (id = 1),
  group_link text check (group_link is null or group_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'),
  updated_at timestamptz not null default now()
);
insert into private.family_private (id) values (1) on conflict (id) do nothing;
revoke all on private.family_private from public, anon, authenticated;

create or replace function private.family_group() returns text
language sql stable security definer set search_path = ''
as $$ select group_link from private.family_private where id = 1 $$;
revoke execute on function private.family_group() from public, anon, authenticated;

-- A new or repeat registration gets the group link back.
select private.patch_function('public.submit_family(jsonb)',
  $p$return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true, 'year', v_year);$p$,
  $p$return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true, 'year', v_year, 'group', private.family_group());$p$);
select private.patch_function('public.submit_family(jsonb)',
  $p$return jsonb_build_object('ok', true, 'ref', v_ref, 'year', v_year);$p$,
  $p$return jsonb_build_object('ok', true, 'ref', v_ref, 'year', v_year, 'group', private.family_group());$p$);

-- Staff: read and set the link (the applications area, like the rest of the family settings).
create or replace function public.staff_family_group(p_link text default null, p_set boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if not (p_set and private.can('applications') or not p_set and private.can_read('applications')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_set then
    if v is not null and v !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$' then
      raise exception 'invalid_link' using errcode = '22023';
    end if;
    update private.family_private set group_link = v, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('group', private.family_group());
end $$;
revoke all on function public.staff_family_group(text, boolean) from public, anon;
grant execute on function public.staff_family_group(text, boolean) to authenticated;
