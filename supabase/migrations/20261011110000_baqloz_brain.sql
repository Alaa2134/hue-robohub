-- A smarter Baqloz in the BuildX App:
-- 1. "Ask Baqloz": the app's chat answers from what's on this person (tasks, meetings, warnings,
--    points, what they borrowed). Most questions are answered on the phone; the rest go to the AI
--    (Edge Function bakloz-app), which first calls app_chat_context as the person: it checks the
--    limits (per person, and the site's daily AI cap and on/off switch shared with the website's
--    guide) and returns only that person's own data.
-- 2. A morning brief: at about 7 every morning, each team member with something on them gets one
--    notification summing up their day (the owner can turn it off in the team rules).

alter table public.team_settings add column if not exists morning_brief boolean not null default true;

select private.patch_function('public.staff_team_settings_save(jsonb)',
  $p$    weekly_report = coalesce((p ->> 'weekly_report')::boolean, weekly_report),$p$,
  $p$    weekly_report = coalesce((p ->> 'weekly_report')::boolean, weekly_report),
    morning_brief = coalesce((p ->> 'morning_brief')::boolean, morning_brief),$p$);

/** For the app's AI chat: may this person ask now, and what's on them. Students pass their session. */
create or replace function public.app_chat_context(p_token text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := coalesce((select value from public.site_settings where key = 'guide_ai'), '{}');
  v_student uuid;
  v_key text;
  v_ok boolean;
  st public.students;
begin
  if p_token is not null then
    v_student := private.session_student(p_token);
    v_key := 'st:' || v_student;
  elsif private.is_staff() then
    v_key := 'staff:' || auth.uid();
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce((v ->> 'enabled')::boolean, true) is false then
    return jsonb_build_object('allowed', false, 'reason', 'off');
  end if;
  v_ok := private.throttle_ip('app_ai', v_key, 8, interval '10 minutes')
      and private.throttle_ip('app_ai_day', v_key, 30, interval '1 day')
      and private.throttle_ip('guide_ai_day', 'site', least(greatest(coalesce((v ->> 'site_day')::int, 300), 1), 20000), interval '1 day');
  if not v_ok then
    insert into private.guide_usage as u (refused) values (1) on conflict (day) do update set refused = u.refused + 1;
    return jsonb_build_object('allowed', false, 'reason', 'busy');
  end if;

  if v_student is not null then
    select * into st from public.students where id = v_student;
    return jsonb_build_object('allowed', true, 'who', 'student', 'now', now(),
      'me', jsonb_build_object('name', st.full_name, 'group', st.group_name),
      'tasks', (select coalesce(jsonb_agg(jsonb_build_object('title', t ->> 'title', 'dueAt', t ->> 'dueAt', 'handedIn', jsonb_typeof(t -> 'submission') = 'object',
                  'grade', t -> 'submission' ->> 'grade')), '[]'::jsonb)
                  from jsonb_array_elements(public.student_tasks(p_token)) t),
      'borrowed', public.student_inventory(p_token));
  end if;
  return jsonb_build_object('allowed', true, 'who', 'staff', 'now', now(),
    'me', (select jsonb_build_object('name', private.staff_name(s.user_id), 'title', s.title, 'role', s.role) from public.staff s where s.user_id = auth.uid()),
    'reminders', public.staff_reminders(),
    'points', (select x - 'staff_id' from public.staff_xp() x),
    'sectors', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'head', m.is_head)), '[]'::jsonb)
                  from public.sector_members m join public.sectors c on c.id = m.sector_id and not c.archived where m.staff_id = auth.uid() and m.active),
    'borrowed', (select coalesce(jsonb_agg(jsonb_build_object('item', i.name, 'quantity', l.quantity, 'dueAt', l.due_at)), '[]'::jsonb)
                   from public.inventory_loans l join public.inventory_items i on i.id = l.item_id where l.staff_id = auth.uid() and l.status = 'out'));
end $$;
revoke execute on function public.app_chat_context(text) from public;
grant execute on function public.app_chat_context(text) to anon, authenticated;

/** Every morning: one notification per team member summing up what's on them today. */
create or replace function private.team_morning_brief() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  v_list jsonb;
  v_parts text[];
  n int;
  r jsonb;
begin
  if not (private.team_rules()).morning_brief then
    return;
  end if;
  for s in select user_id from public.staff where active loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.user_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    v_list := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.staff_reminders()) x where x ->> 'kind' not in ('unread', 'low_stock'));
    if jsonb_array_length(v_list) = 0 then
      continue;
    end if;
    v_parts := '{}';
    n := (select count(*) from jsonb_array_elements(v_list) x where x ->> 'kind' = 'overdue');
    if n > 0 then v_parts := array_append(v_parts, case when n = 1 then 'تاسك فات ميعاده' else n || ' تاسكات فات ميعادهم' end); end if;
    n := (select count(*) from jsonb_array_elements(v_list) x where x ->> 'kind' = 'redo');
    if n > 0 then v_parts := array_append(v_parts, case when n = 1 then 'تاسك محتاج تعديل' else n || ' تاسكات محتاجة تعديل' end); end if;
    n := (select count(*) from jsonb_array_elements(v_list) x where x ->> 'kind' = 'due_soon');
    if n > 0 then v_parts := array_append(v_parts, case when n = 1 then 'تاسك ميعاده قرّب' else n || ' تاسكات ميعادهم قرّب' end); end if;
    n := (select count(*) from jsonb_array_elements(v_list) x where x ->> 'kind' = 'not_started');
    if n > 0 then v_parts := array_append(v_parts, case when n = 1 then 'تاسك لسه مابدأتوش' else n || ' تاسكات لسه مابدأتهمش' end); end if;
    for r in select x from jsonb_array_elements(v_list) x where x ->> 'kind' in ('meeting', 'meeting_open') limit 2 loop
      v_parts := array_append(v_parts, 'اجتماع «' || (r ->> 'title') || '» ' || to_char((r ->> 'at')::timestamptz at time zone 'Africa/Cairo', 'HH12:MI'));
    end loop;
    if exists (select 1 from jsonb_array_elements(v_list) x where x ->> 'kind' = 'warning') then v_parts := array_append(v_parts, 'إنذار جديد'); end if;
    n := (select coalesce(sum(coalesce((x ->> 'count')::int, 1)), 0) from jsonb_array_elements(v_list) x where x ->> 'kind' = 'review');
    if n > 0 then v_parts := array_append(v_parts, case when n = 1 then 'تسليم مستني مراجعتك' else n || ' تسليمات مستنية مراجعتك' end); end if;
    if exists (select 1 from jsonb_array_elements(v_list) x where x ->> 'kind' in ('request', 'appeal', 'store_request')) then v_parts := array_append(v_parts, 'طلبات مستنية ردك'); end if;
    for r in select x from jsonb_array_elements(v_list) x where x ->> 'kind' in ('loan_due', 'loan_overdue') limit 2 loop
      v_parts := array_append(v_parts, 'رجّع «' || (r ->> 'title') || '» للمخزن');
    end loop;
    if cardinality(v_parts) = 0 then
      continue;
    end if;
    perform private.notify_staff_users(array[s.user_id], '☀️ صباح الفل يا ' || split_part(private.staff_name(s.user_id), ' ', 1) || '! النهارده:',
      array_to_string(v_parts, ' · '), '/app/#/staff');
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;
revoke execute on function private.team_morning_brief() from public, anon, authenticated;

-- 04:57 UTC = 6:57 in Cairo in winter, 7:57 with summer time.
select cron.schedule('buildx-morning-brief', '57 4 * * *', $$select private.team_morning_brief()$$);
