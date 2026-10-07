-- The student app's schedule (upcoming sessions for their group plus published events) and
-- announcements from the coaches to a group or to everyone.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  body text not null default '' check (char_length(body) <= 2000),
  group_name text not null default '' check (char_length(group_name) <= 60),
  pinned boolean not null default false,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index announcements_group_idx on public.announcements (group_name, created_at desc);
create index announcements_created_by_idx on public.announcements (created_by);
alter table public.announcements enable row level security;
create policy announcements_staff_select on public.announcements for select to authenticated using ((select private.is_staff()));
create policy announcements_staff_insert on public.announcements for insert to authenticated with check ((select private.is_staff()));
create policy announcements_staff_update on public.announcements for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy announcements_staff_delete on public.announcements for delete to authenticated using ((select private.is_staff()));
grant select, insert, update, delete on public.announcements to authenticated;
revoke all on public.announcements from anon;

/** Student: current announcements for their group (pinned first, then newest; at most 10). */
create or replace function public.student_announcements(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
begin
  select group_name into v_group from public.students where id = v_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'pinned', a.pinned, 'at', a.created_at) order by a.pinned desc, a.created_at desc)
      from (select * from public.announcements
             where (group_name = '' or group_name = v_group) and (expires_at is null or expires_at > now())
             order by pinned desc, created_at desc limit 10) a
  ), '[]'::jsonb);
end $$;

/** Student: what's coming up in the next 60 days — their group's sessions and published events. */
create or replace function public.student_schedule(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_group text;
begin
  select group_name into v_group from public.students where id = v_id;
  return coalesce((
    select jsonb_agg(x order by x ->> 'startsAt')
      from (
        select jsonb_build_object('kind', 'session', 'id', s.id, 'title', s.title, 'startsAt', s.starts_at, 'endsAt', null, 'location', null) as x
          from public.attendance_sessions s
         where s.closed_at is null and s.starts_at > now() - interval '3 hours' and s.starts_at < now() + interval '60 days'
           and (s.group_name = '' or s.group_name = v_group)
        union all
        select jsonb_build_object('kind', 'event', 'id', e.id, 'title', coalesce(nullif(e.title_ar, ''), e.title), 'startsAt', e.starts_at, 'endsAt', e.ends_at,
                                  'location', coalesce(nullif(e.location_ar, ''), e.location), 'slug', e.slug)
          from public.site_content e
         where e.kind = 'event' and e.published and e.starts_at > now() - interval '3 hours' and e.starts_at < now() + interval '60 days'
      ) q
  ), '[]'::jsonb);
end $$;

revoke execute on function public.student_announcements(text), public.student_schedule(text) from public;
grant execute on function public.student_announcements(text), public.student_schedule(text) to anon, authenticated;
