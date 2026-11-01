-- The owner's weekly report, every Sunday morning: the whole site in a minute, from real numbers —
-- new join applications and form replies, the team's late tasks, next week's events, events that
-- ended without a news post, low ratings that need a reply, unanswered messages, and how the students
-- did (attendance, active in the app, new badges). It arrives as a push in the app and an email
-- (both free, right away), and on WhatsApp once Meta approves its template (to «رقمك للتنبيهات»).

/** The week's numbers and the short lists behind them. */
create or replace function private.owner_weekly_numbers()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := now() - interval '7 days';
  v jsonb;
begin
  with
  upcoming as (
    select title, at from (
      select coalesce(nullif(btrim(c.title_ar), ''), c.title) as title, c.starts_at as at
        from public.site_content c
       where c.kind = 'event' and c.published and c.starts_at between now() and now() + interval '7 days'
      union all
      select coalesce(nullif(btrim(f.title_ar), ''), f.slug), f.event_at
        from public.forms f
       where not coalesce(f.archived, false) and f.event_at between now() and now() + interval '7 days'
    ) u order by at limit 6
  ),
  no_post as (
    select coalesce(nullif(btrim(f.title_ar), ''), f.slug) as title
      from public.forms f
     where not coalesce(f.archived, false) and f.delegation is null
       and f.event_at between now() - interval '21 days' and now() - interval '3 hours'
       and exists (select 1 from public.form_attendance a join public.form_responses r on r.id = a.response_id where r.form_id = f.id and a.present)
       and not exists (select 1 from public.site_content p where p.kind = 'post' and ('event:form:' || f.id) = any (p.tags))
  ),
  low as (
    select rating from public.event_feedback where created_at >= v_from and rating <= 2
    union all
    select rating from public.form_session_feedback where created_at >= v_from and rating <= 2
  ),
  overdue as (
    select count(*) as n
      from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
     where t.status = 'open' and not a.excused and a.state in ('todo', 'doing', 'redo') and coalesce(a.due_at, t.due_at) < now()
  )
  select jsonb_build_object(
    'applications', (select count(*) from public.applications where created_at >= v_from),
    'formReplies', (select count(*) from public.form_responses where created_at >= v_from),
    'overdueTasks', (select n from overdue),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'at', at)) from upcoming), '[]'::jsonb),
    'noPost', coalesce((select jsonb_agg(title) from (select title from no_post limit 6) x), '[]'::jsonb),
    'noPostCount', (select count(*) from no_post),
    'lowRatings', (select count(*) from low),
    'unanswered', (select count(*) from public.inbox_messages where status = 'new'),
    'attendance', (select count(*) from public.attendance where marked_at >= v_from and status in ('present', 'late')),
    'activeStudents', (select count(*) from private.student_secrets where last_login_at >= v_from),
    'newBadges', (select count(*) from private.student_achievements where earned_at >= v_from)
  ) into v;
  return v;
end $$;
revoke all on function private.owner_weekly_numbers() from public, anon, authenticated;

/** The report as text (the email body and the push). */
create or replace function private.owner_weekly_text(n jsonb)
returns text
language sql immutable set search_path = '' as $$
  select concat_ws(E'\n',
    '📊 أسبوع BuildX HUE في دقيقة',
    '',
    '• طلبات انضمام جديدة: ' || (n ->> 'applications'),
    '• ردود جديدة على الفورمز: ' || (n ->> 'formReplies'),
    '• تاسكات الفريق المتأخرة: ' || (n ->> 'overdueTasks'),
    '• رسايل تواصل لسه من غير رد: ' || (n ->> 'unanswered'),
    '• تقييمات قليلة (نجمة أو اتنين) محتاجة رد: ' || (n ->> 'lowRatings'),
    '• فعاليات خلصت ولسه من غير خبر: ' || (n ->> 'noPostCount')
      || case when jsonb_array_length(n -> 'noPost') > 0
              then ' (' || (select string_agg(x, '، ') from jsonb_array_elements_text(n -> 'noPost') x) || ')' else '' end,
    '',
    'الطلاب: ' || (n ->> 'attendance') || ' حضور · ' || (n ->> 'activeStudents') || ' دخلوا التطبيق · ' || (n ->> 'newBadges') || ' شارة جديدة',
    '',
    case when jsonb_array_length(n -> 'upcoming') > 0
         then 'الأسبوع الجاي:' || E'\n' || (select string_agg('• ' || (e ->> 'title') || ' — ' ||
                to_char((e ->> 'at')::timestamptz at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), E'\n')
                from jsonb_array_elements(n -> 'upcoming') e)
         else 'مفيش فعاليات متسجلة الأسبوع الجاي.' end,
    '',
    'التفاصيل في التطبيق: https://buildxhue.com/app/#/staff/overview')
$$;

-- WhatsApp: a template with the numbers (sent to the owner's alerts number once Meta approves it).
insert into private.wa_templates (name, category, moments, example, body) values
('bx_owner_weekly_v1', 'UTILITY', '{owner_weekly}', '{12,30,2,"ورشة الأردوينو (الخميس)",1,0}',
'📊 تقرير BuildX HUE الأسبوعي
طلبات انضمام جديدة: {{1}}
ردود على الفورمز: {{2}}
تاسكات الفريق المتأخرة: {{3}}
الأسبوع الجاي: {{4}}
فعاليات من غير خبر: {{5}}
تقييمات قليلة محتاجة رد: {{6}}
التفاصيل في التطبيق: buildxhue.com/app')
on conflict (name) do nothing;

insert into private.wa_auto_rules (key, section, sort, label_ar, hint_ar, vars_ar, template, lang, enabled, bulk, enabled_at)
values ('owner_weekly', 'team', 20, 'تقريرك الأسبوعي (كل أحد)',
        'كل أحد الصبح: الطلبات، التاسكات المتأخرة، فعاليات الأسبوع، الفعاليات اللي من غير خبر، والتقييمات القليلة. بيتبعت على «رقمك للتنبيهات» اللي فوق.',
        '{{1}} طلبات · {{2}} ردود · {{3}} تاسكات متأخرة · {{4}} فعاليات الأسبوع · {{5}} من غير خبر · {{6}} تقييمات قليلة',
        'bx_owner_weekly_v1', 'ar', true, false, now())
on conflict (key) do nothing;

/** Sunday: push + email to the owners, WhatsApp to the alerts number. Returns the numbers. */
create or replace function private.owner_weekly_report()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := private.owner_weekly_numbers();
  v_text text := private.owner_weekly_text(n);
  v_week text := to_char(now() at time zone 'Africa/Cairo', 'IYYY-IW');
  o record;
  v_phone text;
  v_next text;
begin
  -- Push to the owners and overseers.
  begin
    perform private.notify_staff_users(private.overseer_ids(), '📊 تقرير الأسبوع',
      (n ->> 'applications') || ' طلب · ' || (n ->> 'overdueTasks') || ' تاسك متأخر · ' || (n ->> 'noPostCount') || ' فعالية من غير خبر · '
        || (n ->> 'lowRatings') || ' تقييم قليل', '/app/#/staff/overview');
  exception when others then null;
  end;
  -- Email to each owner (once per week).
  if exists (select 1 from private.email_account where id = 1 and status = 'ok') then
    for o in select s.email, s.full_name from public.staff s where s.role = 'owner' and s.active and s.email is not null loop
      continue when exists (select 1 from public.email_messages m where m.to_email = lower(o.email) and m.context = 'owner_weekly:' || v_week);
      begin
        perform private.email_queue(o.email, o.full_name, '📊 أسبوع BuildX HUE في دقيقة', v_text, 'auto', 'owner_weekly', 'owner_weekly:' || v_week, null, false);
      exception when others then null;
      end;
    end loop;
  end if;
  -- WhatsApp to the alerts number (when the template is approved and the moment is on).
  select coalesce(r2.to_phone, r1.to_phone) into v_phone
    from private.wa_auto_rules r1 left join private.wa_auto_rules r2 on r2.key = 'owner_weekly'
   where r1.key = 'send_failed_alert';
  select string_agg((e ->> 'title') || ' (' || to_char((e ->> 'at')::timestamptz at time zone 'Africa/Cairo', 'DD/MM') || ')', '، ')
    into v_next from (select e from jsonb_array_elements(n -> 'upcoming') e limit 3) x;
  if v_phone is not null then
    perform private.wa_auto('owner_weekly', v_phone, null,
      jsonb_build_array(n ->> 'applications', n ->> 'formReplies', n ->> 'overdueTasks', coalesce(v_next, 'مفيش'), n ->> 'noPostCount', n ->> 'lowRatings'),
      'owner_weekly:' || v_week);
  end if;
  return n;
end $$;
revoke all on function private.owner_weekly_report() from public, anon, authenticated;

/** The owner sees this week's report in the app any time (and can send it to themselves now). */
create or replace function public.staff_owner_weekly(p_send boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  n := case when p_send then private.owner_weekly_report() else private.owner_weekly_numbers() end;
  return n || jsonb_build_object('text', private.owner_weekly_text(n));
end $$;
revoke all on function public.staff_owner_weekly(boolean) from public, anon;
grant execute on function public.staff_owner_weekly(boolean) to authenticated;

select private.wa_templates_submit();

-- Sunday 07:11 UTC = 9:11 Cairo (10:11 in summer).
select cron.schedule('buildx-owner-weekly', '11 7 * * 0', 'select private.owner_weekly_report()');
