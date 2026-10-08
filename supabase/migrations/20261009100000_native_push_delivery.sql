-- Notifications on the phone, in the BuildX HUE app (FCM on Android, APNs on iPhone) next to the
-- browser ones, and the ones students get by themselves:
--   a new lecture or file, a new quiz, a new task, a new announcement → that group (or everyone)
--   an hour before a session                                          → that group
-- The owner pastes the Firebase and Apple keys in the app (/staff/push-keys); they are stored here
-- and never read back. Until they are set, phones simply get nothing and the browser ones still go.

alter table public.attendance_sessions add column if not exists reminded_at timestamptz;

-- Store-app devices for a message: team members only for their areas, like the browser ones.
create or replace function public.push_native_targets(p_message uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'fcm', (select value from private.app_secrets where name = 'fcm_service_account'),
    'apns', jsonb_build_object(
      'key', (select value from private.app_secrets where name = 'apns_key_p8'),
      'key_id', (select value from private.app_secrets where name = 'apns_key_id'),
      'team_id', (select value from private.app_secrets where name = 'apns_team_id')),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('token', d.token, 'platform', d.platform))
        from public.native_push_tokens d
        left join public.students st on st.id = d.student_id
        left join public.staff x on x.user_id = d.staff_id
       where d.disabled_at is null
         and case m.audience
               when 'staff' then d.app = 'staff' and x.active
                 and (m.area is null or x.role in ('owner', 'admin')
                      or m.area = any(coalesce(x.permissions, array['applications', 'students', 'events', 'content', 'inbox', 'certificates'])))
               when 'students' then d.app = 'student' and st.active
               when 'group' then d.app = 'student' and st.active and st.group_name = m.group_name
               else (d.app = 'staff' and x.active) or (d.app = 'student' and st.active)
             end
    ), '[]'::jsonb))
  from public.push_messages m where m.id = p_message
$$;
revoke execute on function public.push_native_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_native_targets(uuid) to service_role;

-- push-deliver gets the browser and the phone devices together.
create or replace function public.push_deliver_claim(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.push_tokens
   where message_id = p_id and token = p_token and created_at > now() - interval '1 hour';
  if not found then
    return null;
  end if;
  return public.push_targets(p_id) || jsonb_build_object('native', public.push_native_targets(p_id));
end $$;
revoke execute on function public.push_deliver_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.push_deliver_claim(uuid, text) to service_role;

/** Edge Function only: the outcome, with the browser and phone devices the push services say are gone. */
create or replace function public.push_report_all(p_message uuid, p_targets int, p_delivered int, p_gone text[], p_gone_native text[]) returns void
language sql security definer set search_path = ''
as $$
  update public.push_messages set targets = p_targets, delivered = p_delivered, failed = p_targets - p_delivered where id = p_message;
  update public.push_subscriptions set disabled_at = now() where endpoint = any (coalesce(p_gone, '{}')) and disabled_at is null;
  update public.native_push_tokens set disabled_at = now() where token = any (coalesce(p_gone_native, '{}')) and disabled_at is null;
$$;
revoke execute on function public.push_report_all(uuid, int, int, text[], text[]) from public, anon, authenticated;
grant execute on function public.push_report_all(uuid, int, int, text[], text[]) to service_role;

/** Edge Function only (send-push): a delivery token for a message the caller just created. */
create or replace function public.push_issue_token(p_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into private.push_tokens (message_id, token) values (p_id, v_token)
  on conflict (message_id) do update set token = excluded.token, created_at = now();
  return v_token;
end $$;
revoke execute on function public.push_issue_token(uuid) from public, anon, authenticated;
grant execute on function public.push_issue_token(uuid) to service_role;

-- A message to students (one group, or everyone when the group is ''). Same rules as the team's:
-- a burst of the same kind for the same group within a minute is one notification, nothing is
-- written when no student device could get it, and it never blocks the save that caused it.
create or replace function private.notify_students(p_group text, p_kind text, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_group text := nullif(btrim(coalesce(p_group, '')), '');
  v_id uuid;
  v_token text;
begin
  if exists (select 1 from public.push_messages
              where area = p_kind and sent_by is null and audience in ('students', 'group')
                and coalesce(group_name, '') = coalesce(v_group, '') and created_at > now() - interval '1 minute') then
    return;
  end if;
  if not exists (select 1 from public.push_subscriptions s join public.students st on st.id = s.student_id
                  where s.audience = 'student' and s.disabled_at is null and st.active and (v_group is null or st.group_name = v_group))
     and not exists (select 1 from public.native_push_tokens d join public.students st on st.id = d.student_id
                  where d.app = 'student' and d.disabled_at is null and st.active and (v_group is null or st.group_name = v_group)) then
    return;
  end if;
  insert into public.push_messages (title, body, url, audience, group_name, area)
  values (left(btrim(p_title), 80), left(coalesce(btrim(p_body), ''), 240), p_url, case when v_group is null then 'students' else 'group' end, v_group, p_kind)
  returning id into v_id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.push_tokens (message_id, token) values (v_id, v_token);
  perform net.http_post(
    url := 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/push-deliver',
    body := jsonb_build_object('id', v_id, 'token', v_token),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  null;
end $$;
revoke execute on function private.notify_students(text, text, text, text, text) from public, anon, authenticated;

-- New lecture or file (when it is published).
create or replace function private.on_material_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform private.notify_students(new.group_name, 'material', 'محتوى جديد 📚', new.title, '/app/#/me/content');
  end if;
  return null;
end $$;
create or replace trigger materials_notify after insert or update of published on public.materials for each row execute function private.on_material_notify();

-- New quiz.
create or replace function private.on_quiz_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform private.notify_students(new.group_name, 'quiz', 'كويز جديد 🎯',
      new.title || case when new.opens_at > now() then ' · يفتح ' || to_char(new.opens_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') else '' end,
      '/app/#/me/quizzes');
  end if;
  return null;
end $$;
create or replace trigger quizzes_notify after insert or update of published on public.quizzes for each row execute function private.on_quiz_notify();

-- New task.
create or replace function private.on_assignment_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform private.notify_students(new.group_name, 'task', 'تاسك جديد 📝',
      new.title || case when new.due_at is not null then ' · آخر ميعاد ' || to_char(new.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') else '' end,
      '/app/#/me/tasks');
  end if;
  return null;
end $$;
create or replace trigger assignments_notify after insert or update of published on public.assignments for each row execute function private.on_assignment_notify();

-- New announcement.
create or replace function private.on_announcement_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify_students(new.group_name, 'announce', '📣 ' || new.title, left(new.body, 200), '/app/#/me');
  return null;
end $$;
create or replace trigger announcements_notify after insert on public.announcements for each row execute function private.on_announcement_notify();

-- An hour before each open session, its group hears about it (every 10 minutes, once per session).
create or replace function private.session_reminders() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    update public.attendance_sessions set reminded_at = now()
     where closed_at is null and reminded_at is null
       and starts_at > now() + interval '40 minutes' and starts_at <= now() + interval '70 minutes'
    returning title, group_name, starts_at
  loop
    perform private.notify_students(r.group_name, 'session', 'السيشن كمان ساعة ⏰',
      r.title || ' · ' || to_char(r.starts_at at time zone 'Africa/Cairo', 'HH24:MI'), '/app/#/me/schedule');
  end loop;
end $$;
revoke execute on function private.session_reminders() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'buildx-session-reminders';
select cron.schedule('buildx-session-reminders', '*/10 * * * *', $$select private.session_reminders()$$);

-- The owner sets the phone keys from the app. Write-only: the app only ever learns whether each is set.
create or replace function public.staff_push_keys_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'web', exists (select 1 from private.app_secrets where name = 'vapid_private'),
    'android', exists (select 1 from private.app_secrets where name = 'fcm_service_account'),
    'ios', (select count(*) = 3 from private.app_secrets where name in ('apns_key_p8', 'apns_key_id', 'apns_team_id')),
    'devices', (select jsonb_build_object(
       'android', count(*) filter (where platform = 'android'),
       'ios', count(*) filter (where platform = 'ios'))
       from public.native_push_tokens where disabled_at is null));
end $$;

create or replace function public.staff_set_push_keys(p_fcm text default null, p_apns_p8 text default null, p_apns_key_id text default null, p_apns_team_id text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_fcm jsonb;
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_fcm, '')), '') is not null then
    begin
      v_fcm := p_fcm::jsonb;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'fcm_json');
    end;
    if v_fcm ->> 'type' is distinct from 'service_account' or coalesce(v_fcm ->> 'project_id', '') = '' or coalesce(v_fcm ->> 'client_email', '') = ''
       or coalesce(v_fcm ->> 'private_key', '') not like '%PRIVATE KEY%' then
      return jsonb_build_object('ok', false, 'error', 'fcm_json');
    end if;
    insert into private.app_secrets (name, value)
    values ('fcm_service_account', jsonb_build_object('project_id', v_fcm ->> 'project_id', 'client_email', v_fcm ->> 'client_email', 'private_key', v_fcm ->> 'private_key')::text)
    on conflict (name) do update set value = excluded.value;
  end if;
  if nullif(btrim(coalesce(p_apns_p8, '')), '') is not null then
    if p_apns_p8 not like '%BEGIN PRIVATE KEY%' or btrim(coalesce(p_apns_key_id, '')) !~ '^[A-Z0-9]{10}$' or btrim(coalesce(p_apns_team_id, '')) !~ '^[A-Z0-9]{10}$' then
      return jsonb_build_object('ok', false, 'error', 'apns');
    end if;
    insert into private.app_secrets (name, value) values
      ('apns_key_p8', btrim(p_apns_p8)), ('apns_key_id', btrim(p_apns_key_id)), ('apns_team_id', btrim(p_apns_team_id))
    on conflict (name) do update set value = excluded.value;
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'update', 'push_keys', null,
          jsonb_build_object('android', p_fcm is not null and btrim(p_fcm) <> '', 'ios', p_apns_p8 is not null and btrim(p_apns_p8) <> ''));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.staff_push_keys_status(), public.staff_set_push_keys(text, text, text, text) from public, anon;
grant execute on function public.staff_push_keys_status(), public.staff_set_push_keys(text, text, text, text) to authenticated;
