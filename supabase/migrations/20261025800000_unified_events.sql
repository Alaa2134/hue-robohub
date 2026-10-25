-- One system for events: an event on the website takes its registrations through a form, so it gets
-- everything forms already do (accept / waiting list / capacity, payment, QR pass and attendance,
-- buses and trip letters, WhatsApp moments). New here: the bus question people answer themselves
-- (seats per bus, full buses can't be picked, the bus group is set on its own), and the organiser's
-- numbers for one event.

alter table public.site_content add column if not exists form_id uuid references public.forms (id) on delete set null;
create index if not exists site_content_form_idx on public.site_content (form_id) where form_id is not null;

-- ─── The bus question ────────────────────────────────────────────────────
-- A field {type: 'bus', options: [{ar, en, seats}]}: the k-th bus is «أتوبيس k». seats is a number (a limit),
-- empty (no limit) or '-' (not a bus: "coming on my own"), which takes no seat and puts no one in a bus group.

/** Seats left on one bus of a form (null: no limit). People turned down don't hold a seat. */
create or replace function private.bus_left(p_form uuid, p_field jsonb, p_option text)
returns integer language sql stable security definer set search_path = '' as $$
  select case when o ->> 'seats' ~ '^[0-9]{1,4}$' then
    greatest(0, (o ->> 'seats')::int - (select count(*)::int from public.form_responses r
      where r.form_id = p_form and r.status <> 'rejected' and r.answers ->> (p_field ->> 'id') = p_option))
  end
  from jsonb_array_elements(coalesce(p_field -> 'options', '[]')) o
  where o ->> 'ar' = p_option
  limit 1
$$;
revoke all on function private.bus_left(uuid, jsonb, text) from public, anon, authenticated;

/** Seats left per bus question, for the form page: {field: {option: left}} (buses without a limit left out). */
create or replace function private.form_buses_left(p_form uuid, p_fields jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.id, x.left_), '{}') from (
    select fld ->> 'id' as id,
           (select coalesce(jsonb_object_agg(o ->> 'ar', private.bus_left(p_form, fld, o ->> 'ar')), '{}')
              from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o where o ->> 'seats' ~ '^[0-9]{1,4}$') as left_
      from jsonb_array_elements(coalesce(p_fields, '[]')) fld
     where fld ->> 'type' = 'bus'
  ) x
$$;
revoke all on function private.form_buses_left(uuid, jsonb) from public, anon, authenticated;

/** The bus picked on the form puts the person in that bus's group (trip letters, bus lists, boarding QR). */
create or replace function private.form_bus_tag() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fld jsonb;
  v text;
  n int;
begin
  select x into fld from public.forms f, jsonb_array_elements(f.fields) x where f.id = new.form_id and x ->> 'type' = 'bus' limit 1;
  if fld is null then return new; end if;
  v := new.answers ->> (fld ->> 'id');
  if tg_op = 'UPDATE' and v is not distinct from old.answers ->> (fld ->> 'id') then return new; end if;
  select b.n into n from (
    select o.val, sum(case when o.val ->> 'seats' = '-' then 0 else 1 end) over (order by o.k) as n
      from jsonb_array_elements(coalesce(fld -> 'options', '[]')) with ordinality o(val, k)) b
   where b.val ->> 'ar' = v and b.val ->> 'seats' is distinct from '-';
  new.tags := array(select t from unnest(coalesce(new.tags, '{}')) t where t !~ '^أتوبيس [0-9]+$')
              || case when n is not null then array['أتوبيس ' || n] else '{}'::text[] end;
  return new;
end $$;
create or replace trigger form_responses_bus before insert or update of answers on public.form_responses
  for each row execute function private.form_bus_tag();

-- submit_form: a bus answer must be one of the buses and that bus must have a seat.
do $patch$
declare
  d text := pg_get_functiondef('public.submit_form(text,jsonb,text,text)'::regprocedure);
  anchor text := '    if v_type = ''select'' and v_text not in';
begin
  if position('v_type = ''bus''' in d) > 0 then return; end if;
  if position(anchor in d) = 0 then raise exception 'submit_form anchor missing'; end if;
  d := replace(d, anchor, $add$    if v_type = 'bus' then
      if v_text not in (select o ->> 'ar' from jsonb_array_elements(coalesce(fld -> 'options', '[]')) o) then
        v_errors := v_errors || jsonb_build_object(v_id, 'option'); continue;
      end if;
      if coalesce(private.bus_left(f.id, fld, v_text), 1) <= 0 then
        v_errors := v_errors || jsonb_build_object(v_id, 'bus_full'); continue;
      end if;
    end if;
$add$ || anchor);
  execute d;
end $patch$;

-- public_form: seats left on each bus.
create or replace function public.public_form(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', f.slug, 'title_ar', f.title_ar, 'title_en', f.title_en, 'intro_ar', f.intro_ar, 'intro_en', f.intro_en,
    'success_ar', f.success_ar, 'success_en', f.success_en, 'fields', f.fields, 'team', f.team,
    'open', private.form_is_open(f), 'opens_at', f.opens_at, 'closes_at', f.closes_at,
    'background_path', f.background_path, 'background_kind', f.background_kind,
    'payment', case when coalesce((f.payment ->> 'on')::boolean, false) then jsonb_build_object(
      'amount', f.payment -> 'amount', 'note_ar', nullif(f.payment ->> 'note_ar', ''), 'note_en', nullif(f.payment ->> 'note_en', '')) end,
    'buses', nullif(private.form_buses_left(f.id, f.fields), '{}'::jsonb)
  )
  from public.forms f where f.slug = lower(btrim(p_slug)) and not f.archived
$$;

-- ─── The event page ──────────────────────────────────────────────────────
-- An event with a registration form shows that form instead of the quick RSVP.
create or replace function public.event_rsvp(p_event uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'open', c.rsvp_open and coalesce(c.ends_at, c.starts_at + interval '6 hours', now() + interval '1 day') > now(),
    'capacity', c.capacity,
    'going', (select count(*) from public.event_registrations r where r.event_id = c.id and r.status = 'going'),
    'form', (select f.slug from public.forms f where f.id = c.form_id and not f.archived)
  ))
  from public.site_content c
  where c.id = p_event and c.kind = 'event' and c.published and (c.publish_at is null or c.publish_at <= now())
$$;

-- ─── The organiser ───────────────────────────────────────────────────────

/** Link an event to a registration form (or unlink with null). */
create or replace function public.staff_event_link_form(p_event uuid, p_form uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('forms') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_form is not null and not exists (select 1 from public.forms where id = p_form and not archived) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.site_content set form_id = p_form, updated_at = now() where id = p_event and kind = 'event';
  return found;
end $$;
revoke all on function public.staff_event_link_form(uuid, uuid) from public, anon;
grant execute on function public.staff_event_link_form(uuid, uuid) to authenticated;

/** A registration form made from the event (name, phone, faculty; capacity, date and deadline from the event), linked to it. */
create or replace function public.staff_event_make_form(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.site_content;
  v_slug text;
  v_id uuid;
begin
  if not private.can('forms') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.site_content where id = p_event and kind = 'event';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.form_id is not null and exists (select 1 from public.forms where id = e.form_id and not archived) then return e.form_id; end if;
  v_slug := left(coalesce(e.slug, 'event'), 40);
  if exists (select 1 from public.forms where slug = v_slug) then
    v_slug := left(v_slug, 40) || '-' || substr(md5(random()::text), 1, 5);
  end if;
  insert into public.forms (slug, title_ar, title_en, intro_ar, fields, open, listed, capacity, event_at, closes_at, created_by)
  values (
    v_slug,
    left(coalesce(nullif(e.title_ar, ''), nullif(e.title, ''), 'تسجيل فعالية'), 160),
    nullif(left(e.title, 160), ''),
    left(coalesce(e.summary_ar, e.summary), 2000),
    jsonb_build_array(
      jsonb_build_object('id', 'name', 'type', 'name', 'label_ar', 'الاسم بالكامل', 'label_en', 'Full name', 'required', true),
      jsonb_build_object('id', 'phone', 'type', 'phone', 'label_ar', 'رقم الموبايل (واتساب)', 'label_en', 'Mobile (WhatsApp)', 'required', true),
      jsonb_build_object('id', 'faculty', 'type', 'text', 'label_ar', 'الكلية والفرقة', 'label_en', 'Faculty and year', 'required', false)
    ),
    false, false, e.capacity, e.starts_at, e.starts_at, auth.uid()
  ) returning id into v_id;
  update public.site_content set form_id = v_id, updated_at = now() where id = e.id;
  return v_id;
end $$;
revoke all on function public.staff_event_make_form(uuid) from public, anon;
grant execute on function public.staff_event_make_form(uuid) to authenticated;

/** One event at a glance for its organiser: the funnel, payment, attendance, buses, ratings and the last two weeks. */
create or replace function public.staff_event_hub(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  e public.site_content;
  f public.forms;
  v_form jsonb;
  v_rsvp jsonb;
begin
  if not (private.can('events') or private.can('forms')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.site_content where id = p_event and kind = 'event';
  if not found then return null; end if;

  select jsonb_build_object(
    'going', count(*) filter (where status = 'going'),
    'waitlist', count(*) filter (where status = 'waitlist'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'inside', count(*) filter (where checked_in_at is not null),
    'rating', (select round(avg(rating)::numeric, 1) from public.event_feedback where event_id = e.id),
    'ratings', (select count(*) from public.event_feedback where event_id = e.id)
  ) into v_rsvp from public.event_registrations where event_id = e.id;

  select * into f from public.forms where id = e.form_id;
  if found then
    select jsonb_build_object(
      'id', f.id, 'slug', f.slug, 'title_ar', f.title_ar, 'open', private.form_is_open(f), 'archived', f.archived,
      'capacity', f.capacity, 'event_at', f.event_at, 'closes_at', f.closes_at,
      'pay', case when coalesce((f.payment ->> 'on')::boolean, false) then coalesce((f.payment ->> 'amount')::numeric, 0) end,
      'attendance', coalesce((f.attendance ->> 'on')::boolean, false),
      'sessions', jsonb_array_length(coalesce(f.attendance -> 'sessions', '[]')),
      'total', count(r.id),
      'new', count(r.id) filter (where r.status = 'new'),
      'accepted', count(r.id) filter (where r.status = 'accepted'),
      'waiting', count(r.id) filter (where r.status = 'waiting'),
      'rejected', count(r.id) filter (where r.status = 'rejected'),
      'paid', count(r.id) filter (where r.status = 'accepted' and r.paid_at is not null),
      'collected', coalesce(sum(r.paid_amount) filter (where r.status = 'accepted' and r.paid_at is not null), 0),
      'present', (select count(distinct a.response_id) from public.form_attendance a join public.form_responses x on x.id = a.response_id where x.form_id = f.id and a.present),
      'rating', (select round(avg(s.rating)::numeric, 1) from public.form_session_feedback s join public.form_responses x on x.id = s.response_id where x.form_id = f.id),
      'ratings', (select count(*) from public.form_session_feedback s join public.form_responses x on x.id = s.response_id where x.form_id = f.id),
      'days', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
                 select (x.created_at at time zone 'Africa/Cairo')::date d, count(*) n from public.form_responses x
                  where x.form_id = f.id and x.created_at > now() - interval '14 days' group by 1) z),
      'buses', (select coalesce(jsonb_agg(jsonb_build_object('n', q.n, 'label', o.val ->> 'ar',
                   'seats', case when o.val ->> 'seats' ~ '^[0-9]{1,4}$' then (o.val ->> 'seats')::int end,
                   'people', q.people, 'accepted', q.accepted) order by q.n), '[]')
                 from (select (regexp_match(t, '[0-9]+'))[1]::int n, count(*) people, count(*) filter (where x.status = 'accepted') accepted
                         from public.form_responses x, unnest(x.tags) t
                        where x.form_id = f.id and x.status <> 'rejected' and t ~ '^أتوبيس [0-9]+$'
                        group by 1) q
                 left join lateral (
                   select b.val from (
                     select o.val, row_number() over (order by o.k) as n
                       from jsonb_array_elements(f.fields) fl, jsonb_array_elements(coalesce(fl -> 'options', '[]')) with ordinality o(val, k)
                      where fl ->> 'type' = 'bus' and o.val ->> 'seats' is distinct from '-') b
                    where b.n = q.n limit 1) o on true)
    ) into v_form
    from public.form_responses r where r.form_id = f.id;
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', coalesce(nullif(e.title_ar, ''), e.title), 'starts_at', e.starts_at, 'ends_at', e.ends_at,
                                'location', coalesce(nullif(e.location_ar, ''), e.location), 'published', e.published, 'rsvp_open', e.rsvp_open, 'capacity', e.capacity),
    'form', v_form,
    'rsvp', v_rsvp
  );
end $$;
revoke all on function public.staff_event_hub(uuid) from public, anon;
grant execute on function public.staff_event_hub(uuid) to authenticated;

/** Every event with its numbers from whichever way it registers (the events list). */
create or replace function public.staff_events_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.can('events') or private.can('forms')) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(z) order by z.starts_at desc nulls last), '[]') from (
    select c.id, c.slug, c.title, c.title_ar, c.starts_at, c.capacity, c.rsvp_open, c.published, c.form_id,
           f.slug as form_slug, case when f.id is not null then private.form_is_open(f) end as form_open,
           (select count(*) from public.event_registrations r where r.event_id = c.id and r.status = 'going') as going,
           (select count(*) from public.event_registrations r where r.event_id = c.id and r.status = 'waitlist') as waitlist,
           (select count(*) from public.event_registrations r where r.event_id = c.id and r.checked_in_at is not null) as inside,
           (select count(*) from public.form_responses r where r.form_id = f.id) as responses,
           (select count(*) from public.form_responses r where r.form_id = f.id and r.status = 'accepted') as accepted,
           (select count(*) from public.form_responses r where r.form_id = f.id and r.status = 'waiting') as waiting
      from public.site_content c left join public.forms f on f.id = c.form_id
     where c.kind = 'event'
     order by c.starts_at desc nulls last
     limit 200) z);
end $$;
revoke all on function public.staff_events_overview() from public, anon;
grant execute on function public.staff_events_overview() to authenticated;
