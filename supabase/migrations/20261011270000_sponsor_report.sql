-- The monthly report for sponsors: what BuildX HUE did in a period, in numbers a sponsor cares about
-- (reach on the website, training, events, new members, certificates, projects). Read by whoever sees
-- the sponsorship inbox; the app turns it into a branded PDF (src/portal/sponsor-report.tsx).

create or replace function public.staff_sponsor_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  v_len interval := (p_to + 1)::timestamptz - p_from::timestamptz;
begin
  if not private.can_read('inbox') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'bad period' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'reach', jsonb_build_object(
      'views', (select count(*) from private.page_views v where v.at >= v_from and v.at < v_to),
      'visitors', (select count(distinct (v.day, v.visitor)) from private.page_views v where v.at >= v_from and v.at < v_to),
      'views_before', (select count(*) from private.page_views v where v.at >= v_from - v_len and v.at < v_from),
      'countries', (select count(distinct v.country) from private.page_views v where v.at >= v_from and v.at < v_to and v.country is not null),
      'mobile', (select count(*) from private.page_views v where v.at >= v_from and v.at < v_to and v.device = 'mobile'),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('path', t.path, 'views', t.n) order by t.n desc)
        from (
          select v.path, count(*) n from private.page_views v
          where v.at >= v_from and v.at < v_to
          group by v.path order by count(*) desc limit 5
        ) t
      ), '[]'::jsonb)
    ),
    'training', jsonb_build_object(
      'sessions', (select count(*) from public.attendance_sessions s where s.starts_at >= v_from and s.starts_at < v_to),
      'attendances', (
        select count(*) from public.attendance a
        join public.attendance_sessions s on s.id = a.session_id
        where s.starts_at >= v_from and s.starts_at < v_to and a.status in ('present', 'late')
      ),
      'students', (
        select count(distinct a.student_id) from public.attendance a
        join public.attendance_sessions s on s.id = a.session_id
        where s.starts_at >= v_from and s.starts_at < v_to and a.status in ('present', 'late')
      ),
      'active', (select count(*) from public.students st where st.active),
      'quizzes', (select count(*) from public.quiz_attempts q where q.submitted_at >= v_from and q.submitted_at < v_to)
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', coalesce(nullif(e.title_ar, ''), e.title),
        'at', e.starts_at,
        'registered', (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled'),
        'attended', (select count(*) from public.event_registrations r where r.event_id = e.id and r.checked_in_at is not null)
      ) order by e.starts_at)
      from public.site_content e
      where e.kind = 'event' and e.published and e.starts_at >= v_from and e.starts_at < v_to
    ), '[]'::jsonb),
    'community', jsonb_build_object(
      'applications', (select count(*) from public.applications ap where ap.created_at >= v_from and ap.created_at < v_to),
      'accepted', (select count(*) from public.applications ap where ap.status = 'accepted' and ap.reviewed_at >= v_from and ap.reviewed_at < v_to),
      'new_students', (select count(*) from public.students st where st.created_at >= v_from and st.created_at < v_to)
    ),
    'output', jsonb_build_object(
      'certificates', (select count(*) from public.certificates c where c.issued_on between p_from and p_to and c.revoked_at is null),
      'projects', (select count(*) from public.student_projects p where p.status = 'published' and p.reviewed_at >= v_from and p.reviewed_at < v_to),
      'posts', (
        select count(*) from public.site_content c
        where c.kind in ('post', 'achievement', 'story') and c.published
          and coalesce(c.publish_at, c.created_at) >= v_from and coalesce(c.publish_at, c.created_at) < v_to
      ),
      'highlights', coalesce((
        select jsonb_agg(jsonb_build_object('title', coalesce(nullif(c.title_ar, ''), c.title), 'kind', c.kind) order by coalesce(c.publish_at, c.created_at))
        from (
          select * from public.site_content c
          where c.kind in ('achievement', 'post') and c.published
            and coalesce(c.publish_at, c.created_at) >= v_from and coalesce(c.publish_at, c.created_at) < v_to
          order by c.kind, coalesce(c.publish_at, c.created_at) desc
          limit 6
        ) c
      ), '[]'::jsonb)
    ),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(nullif(c.title_ar, ''), c.title), 'image', c.image_path) order by c.sort_order, c.title)
      from public.site_content c
      where c.kind = 'partner' and c.published
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_sponsor_report(date, date) from public, anon;
grant execute on function public.staff_sponsor_report(date, date) to authenticated;
