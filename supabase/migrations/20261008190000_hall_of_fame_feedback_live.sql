-- BuildX HUE — website round 2:
--   1. Hall of fame: the top students by points and a member of the month, on the website, only
--      when the team turns it on (short names: first name + initial).
--   2. Event feedback: registrants rate the event from their ticket page; the team reads it in the
--      app and can publish the good ones as testimonials.
--   3. What's on now, for the guide (Baqloz) and his AI: next events with places left, latest
--      news, open forms, whether applications are open. Public data only.
-- New tables and functions only: nothing existing is changed or dropped.

-- ─────────────────────────────────────────────────────────────── 1. hall of fame
insert into public.site_settings (key, value)
values ('hall_of_fame', '{"show": false, "count": 10, "star": null}')
on conflict (key) do nothing;

/** "Ahmed M." from "Ahmed Mohamed Ali". */
create or replace function private.short_name(p text) returns text
language sql immutable set search_path = ''
as $$
  select split_part(btrim(p), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(p), ' ', 2), ''), 1) || '.', '')
$$;
revoke execute on function private.short_name(text) from public, anon, authenticated;

create or replace function public.hall_of_fame() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb := coalesce((select value from public.site_settings where key = 'hall_of_fame'), '{}');
  v_star jsonb := null;
  v_board jsonb := '[]';
  v_n int := least(greatest(coalesce((v ->> 'count')::int, 10), 3), 20);
begin
  if v -> 'star' ? 'student_id' then
    select jsonb_build_object(
      'name', split_part(btrim(s.full_name), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(s.full_name), ' ', 2), ''), ''),
      'group', s.group_name,
      'reason_ar', v -> 'star' ->> 'reason_ar',
      'reason_en', v -> 'star' ->> 'reason_en',
      'month', v -> 'star' ->> 'month',
      'points', (select t.points from private.points_table() t where t.student_id = s.id)
    ) into v_star
    from public.students s
    where s.id = (v -> 'star' ->> 'student_id')::uuid and s.active;
  end if;
  if coalesce((v ->> 'show')::boolean, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', private.short_name(t.name), 'points', t.points,
      'badges', cardinality(private.badges(t.attended, t.quizzes, t.perfect, t.certs, t.events, t.bonus))
    ) order by t.points desc, t.name), '[]')
      into v_board
      from (select * from private.points_table() where points > 0 order by points desc, name limit v_n) t;
  end if;
  return jsonb_build_object('star', v_star, 'board', v_board);
exception
  when invalid_text_representation then
    return jsonb_build_object('star', null, 'board', v_board);
end $$;
revoke execute on function public.hall_of_fame() from public;
grant execute on function public.hall_of_fame() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 2. event feedback
create table public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.site_content (id) on delete cascade,
  registration_id uuid not null unique references public.event_registrations (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  publish_ok boolean not null default false,
  testimonial_id uuid references public.site_content (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_feedback_event_idx on public.event_feedback (event_id, created_at desc);
create index event_feedback_testimonial_idx on public.event_feedback (testimonial_id);

alter table public.event_feedback enable row level security;
create policy event_feedback_staff_select on public.event_feedback for select to authenticated using ((select private.is_staff()));
create policy event_feedback_staff_update on public.event_feedback for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy event_feedback_admin_delete on public.event_feedback for delete to authenticated using ((select private.is_admin()));
grant select, update, delete on public.event_feedback to authenticated;
revoke all on public.event_feedback from anon;

/** Rate an event from the ticket page: once it has started, for 30 days; sending again updates it. */
create or replace function public.submit_event_feedback(p_ticket text, p_rating int, p_comment text default null, p_publish boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if not private.throttle('feedback', 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.id, g.event_id, c.starts_at into r
    from public.event_registrations g join public.site_content c on c.id = g.event_id
   where g.ticket = private.norm_ticket(p_ticket) and g.status <> 'cancelled';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.starts_at is null or r.starts_at > now() then
    return jsonb_build_object('ok', false, 'error', 'too_early');
  end if;
  if r.starts_at < now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;
  insert into public.event_feedback (event_id, registration_id, rating, comment, publish_ok)
  values (r.event_id, r.id, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 1000), ''), coalesce(p_publish, false))
  on conflict (registration_id) do update
    set rating = excluded.rating, comment = excluded.comment, publish_ok = excluded.publish_ok, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

/** What this ticket already said (to show it on the ticket page). */
create or replace function public.event_feedback_of(p_ticket text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('rating', f.rating, 'comment', f.comment, 'publish_ok', f.publish_ok)
    from public.event_feedback f join public.event_registrations g on g.id = f.registration_id
   where g.ticket = private.norm_ticket(p_ticket)
$$;

revoke execute on function public.submit_event_feedback(text, int, text, boolean), public.event_feedback_of(text) from public;
grant execute on function public.submit_event_feedback(text, int, text, boolean), public.event_feedback_of(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 3. what's on now (guide)
create or replace function public.guide_live_context() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(),
    'applications_open', coalesce((select (value ->> 'open')::boolean from public.site_settings where key = 'applications'), true),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'title', coalesce(c.title_ar, c.title), 'title_en', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
        'location', coalesce(c.location_ar, c.location),
        'rsvp_open', c.rsvp_open and coalesce(c.ends_at, c.starts_at + interval '6 hours') > now(),
        'capacity', c.capacity,
        'going', (select count(*) from public.event_registrations r where r.event_id = c.id and r.status = 'going')
      ) order by c.starts_at)
      from (select * from public.site_content
             where kind = 'event' and published and (publish_at is null or publish_at <= now())
               and starts_at >= now() - interval '6 hours'
             order by starts_at limit 5) c
    ), '[]'),
    'news', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'title', coalesce(p.title_ar, p.title), 'at', p.created_at) order by p.created_at desc)
      from (select * from public.site_content
             where kind = 'post' and published and (publish_at is null or publish_at <= now())
             order by created_at desc limit 3) p
    ), '[]'),
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title_ar, 'team', f.team, 'closes_at', f.closes_at))
      from public.forms f where private.form_is_open(f) and f.listed
    ), '[]')
  )
$$;
revoke execute on function public.guide_live_context() from public;
grant execute on function public.guide_live_context() to anon, authenticated, service_role;
