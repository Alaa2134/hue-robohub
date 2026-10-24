-- After a form closes the team sorts people: groups on each response (a workshop slot, a team, "got the
-- bus"…), set by staff who manage the form, used to filter and to print a group's PDF. And a look-up
-- of who else this person is: their other forms, whether they're a community member, and their
-- membership application, matched by the same phone (normalised), email or member code.

alter table public.form_responses add column if not exists tags text[] not null default '{}';

create or replace function private.form_tags_ok(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 20
     and not exists (select 1 from unnest(p) t where t is null or char_length(btrim(t)) = 0 or char_length(t) > 40)
$$;

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'form_responses_tags_ok') then
  alter table public.form_responses add constraint form_responses_tags_ok check (private.form_tags_ok(tags));
end if;
end $$;
create index if not exists form_responses_tags_idx on public.form_responses using gin (tags);

/** For each response of a form: the person's other forms, membership and join application. */
create or replace function public.staff_form_links(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if not found then return '{}'::jsonb; end if;
  if not (private.can_read('forms') or (private.can_read('expo') and f.delegation is not null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(x.id, x.info) from (
      select r.id, jsonb_strip_nulls(jsonb_build_object(
        'forms', (select jsonb_agg(jsonb_build_object('title', f2.title_ar, 'status', o.status, 'at', o.created_at) order by o.created_at desc)
                    from public.form_responses o join public.forms f2 on f2.id = o.form_id
                   where o.form_id <> r.form_id
                     and ((r.phone is not null and o.phone = r.phone)
                       or (r.email is not null and o.email = r.email)
                       or (r.student_id is not null and o.student_id = r.student_id))),
        'member', (select jsonb_build_object('code', s.code, 'active', s.active and (s.member_until is null or s.member_until >= private.cairo_today()))
                     from public.students s
                    where s.id = r.student_id or (r.phone is not null and private.clean_phone(s.phone) = r.phone)
                    order by (s.id = r.student_id) desc, s.active desc limit 1),
        'application', (select jsonb_build_object('status', a.status, 'at', a.created_at)
                          from public.applications a
                         where (r.phone is not null and private.clean_phone(a.phone) = r.phone) or (r.email is not null and lower(a.email) = r.email)
                         order by a.created_at desc limit 1)
      )) as info
      from public.form_responses r where r.form_id = p_form
    ) x where x.info <> '{}'::jsonb
  ), '{}'::jsonb);
end $$;
revoke all on function public.staff_form_links(uuid) from public, anon;
grant execute on function public.staff_form_links(uuid) to authenticated;
