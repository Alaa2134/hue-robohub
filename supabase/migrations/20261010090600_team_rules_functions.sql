-- Team rules, part 2: requests, appeals and the rules in the existing task functions (tables in
-- 20261010090500_team_rules.sql).

/** A member asks for more time (with the new deadline they need) or to be excused. The heads are told. */
create or replace function public.staff_task_request(p_task uuid, p_kind text, p_reason text, p_new_due timestamptz default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
  a public.staff_task_assignees;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.staff_tasks where id = p_task and status = 'open';
  select * into a from public.staff_task_assignees where task_id = p_task and staff_id = auth.uid() and state <> 'approved';
  if t.id is null or a.task_id is null then
    raise exception 'not_yours' using errcode = '22023';
  end if;
  if p_kind not in ('extension', 'excuse') then
    raise exception 'bad kind' using errcode = '22023';
  end if;
  if p_kind = 'extension' and (p_new_due is null or p_new_due <= now() or p_new_due <= coalesce(a.due_at, t.due_at)
                               or p_new_due > coalesce(a.due_at, t.due_at) + interval '60 days') then
    raise exception 'bad_due' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff_task_requests where task_id = p_task and staff_id = auth.uid() and status = 'pending') then
    raise exception 'pending' using errcode = '22023';
  end if;
  insert into public.staff_task_requests (task_id, staff_id, kind, reason, new_due)
  values (p_task, auth.uid(), p_kind, btrim(p_reason), case when p_kind = 'extension' then p_new_due end)
  returning id into v_id;
  perform private.notify_staff_users(private.sector_heads(t.sector_id) || t.created_by,
    private.staff_name(auth.uid()) || case when p_kind = 'extension' then ' طالب مد ميعاد: ' else ' طالب عذر من: ' end || t.title,
    btrim(p_reason), '/app/#/staff/sectors/' || t.sector_id || '/' || t.id);
  return v_id;
end $$;

/** Heads: approve or refuse a request (an extension can be approved with a different date). */
create or replace function public.staff_task_request_decide(p_id uuid, p_approve boolean, p_note text default null, p_new_due timestamptz default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.staff_task_requests;
  t public.staff_tasks;
  v_due timestamptz;
begin
  select * into r from public.staff_task_requests where id = p_id and status = 'pending';
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  select * into t from public.staff_tasks where id = r.task_id;
  if not private.leads_sector(t.sector_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_approve then
    if r.kind = 'extension' then
      v_due := coalesce(p_new_due, r.new_due);
      if v_due <= now() then
        raise exception 'bad_due' using errcode = '22023';
      end if;
      update public.staff_task_assignees
         set due_at = v_due, missed_at = null,
             reminded_at = case when v_due < now() + make_interval(hours => (private.team_rules()).remind_hours) then now() end
       where task_id = r.task_id and staff_id = r.staff_id;
    else
      update public.staff_task_assignees set state = 'approved', excused = true, reviewed_by = auth.uid(), reviewed_at = now(), feedback = nullif(btrim(p_note), '')
       where task_id = r.task_id and staff_id = r.staff_id;
      if not exists (select 1 from public.staff_task_assignees where task_id = r.task_id and state <> 'approved') then
        update public.staff_tasks set status = 'closed' where id = r.task_id and status = 'open';
      end if;
    end if;
    -- The automatic warning for this deadline no longer stands.
    update public.staff_warnings set cancelled_at = now(), cancelled_by = auth.uid(),
           cancel_note = case when r.kind = 'extension' then 'اتمد الميعاد' else 'اتقبل العذر' end
     where task_id = r.task_id and staff_id = r.staff_id and kind = 'missed' and cancelled_at is null;
  end if;
  update public.staff_task_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         note = nullif(left(btrim(p_note), 300), ''), new_due = case when p_approve and r.kind = 'extension' then v_due else new_due end
   where id = p_id;
  perform private.notify_staff_users(array[r.staff_id],
    case when p_approve then '✅ اتوافق على طلبك: ' else '❌ اترفض طلبك: ' end || t.title,
    coalesce(nullif(btrim(p_note), ''), case when p_approve and r.kind = 'extension' then 'آخر ميعاد ليك بقى ' || to_char(v_due at time zone 'Africa/Cairo', 'DD/MM HH24:MI')
                                             when p_approve then 'اتعفيت من التاسك.' else 'كمّل التاسك في ميعاده.' end),
    '/app/#/staff/mytasks');
  return jsonb_build_object('ok', true);
end $$;

/** The warned member appeals (once). The overseers are told. */
create or replace function public.staff_warning_appeal(p_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  w public.staff_warnings;
begin
  if not private.is_staff() or coalesce(char_length(btrim(p_text)), 0) < 5 then
    raise exception 'bad appeal' using errcode = '22023';
  end if;
  update public.staff_warnings set appeal = left(btrim(p_text), 600), appeal_at = now(), appeal_status = 'pending'
   where id = p_id and staff_id = auth.uid() and cancelled_at is null and appeal_at is null
  returning * into w;
  if w.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.notify_staff_users(private.overseer_ids(), 'تظلّم من ' || private.staff_name(w.staff_id), left(btrim(p_text), 200), '/app/#/staff/warnings');
  return jsonb_build_object('ok', true);
end $$;

/** Overseers: accept an appeal (the warning is cancelled) or refuse it. */
create or replace function public.staff_warning_appeal_decide(p_id uuid, p_accept boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  w public.staff_warnings;
begin
  if not private.oversees() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_warnings
     set appeal_status = case when p_accept then 'accepted' else 'rejected' end, appeal_decided_by = auth.uid(), appeal_decided_at = now(),
         appeal_note = nullif(left(btrim(p_note), 300), ''),
         cancelled_at = case when p_accept then now() else cancelled_at end,
         cancelled_by = case when p_accept then auth.uid() else cancelled_by end,
         cancel_note = case when p_accept then coalesce(nullif(left(btrim(p_note), 300), ''), 'اتقبل التظلّم') else cancel_note end
   where id = p_id and appeal_status = 'pending'
  returning * into w;
  if w.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.notify_staff_users(array[w.staff_id],
    case when p_accept then '✅ اتقبل تظلّمك والإنذار اتشال' else '❌ تظلّمك اترفض' end,
    coalesce(nullif(btrim(p_note), ''), w.reason), '/app/#/staff/mytasks');
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────── the rules in the existing parts
create or replace function private.on_staff_warning() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  k public.team_settings := private.team_rules();
  v_active int;
begin
  perform private.notify_staff_users(array[new.staff_id], '⚠️ إنذار', new.reason, '/app/#/staff/mytasks');
  select count(*) into v_active from public.staff_warnings
   where staff_id = new.staff_id and cancelled_at is null and created_at > now() - make_interval(days => k.warn_window_days);
  if v_active >= k.warn_threshold then
    perform private.notify_staff_users(array_remove(private.overseer_ids() || private.sector_heads(new.sector_id), new.staff_id),
      private.staff_name(new.staff_id) || ' وصل ' || v_active || ' إنذارات',
      'في آخر ' || k.warn_window_days || ' يوم. آخرها: ' || new.reason, '/app/#/staff/warnings');
  end if;
  return null;
end $$;
revoke execute on function private.on_staff_warning() from public, anon, authenticated;

select private.patch_function('public.staff_task_submit(uuid, text, text)',
  $p$v_late := now() > t.due_at;$p$,
  $p$v_late := now() > coalesce((select x.due_at from public.staff_task_assignees x where x.task_id = p_task and x.staff_id = auth.uid()), t.due_at)
                       + make_interval(mins => (private.team_rules()).grace_minutes);$p$);
select private.patch_function('public.staff_sectors()',
  $p$a.state <> 'approved' and t.due_at < now()$p$,
  $p$a.state <> 'approved' and coalesce(a.due_at, t.due_at) < now()$p$);

/** One task as JSON, with its assignees and requests (all of them for the sector's heads; only mine otherwise). */
create or replace function private.task_json(t public.staff_tasks, p_all boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(t) || jsonb_build_object(
    'sector_name', (select name from public.sectors where id = t.sector_id),
    'sector_color', (select color from public.sectors where id = t.sector_id),
    'created_by_name', private.staff_name(t.created_by),
    'assignees', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('name', private.staff_name(a.staff_id), 'reviewed_by_name', private.staff_name(a.reviewed_by))
                       order by private.staff_name(a.staff_id))
        from public.staff_task_assignees a where a.task_id = t.id and (p_all or a.staff_id = auth.uid())), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object('name', private.staff_name(r.staff_id), 'decided_by_name', private.staff_name(r.decided_by))
                       order by r.created_at desc)
        from public.staff_task_requests r where r.task_id = t.id and (p_all or r.staff_id = auth.uid())), '[]'::jsonb))
$$;
revoke execute on function private.task_json(public.staff_tasks, boolean) from public, anon, authenticated;

/** Home: my tasks, warnings, notifications, and what waits for me as a head or overseer. */
create or replace function public.staff_my_summary() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  k public.team_settings := private.team_rules();
  v_all boolean := private.oversees();
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
              where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo')),
    'overdue', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                 where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo') and coalesce(a.due_at, t.due_at) < now()),
    'due_soon', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                  where a.staff_id = v_me and t.status = 'open' and a.state in ('todo', 'doing', 'redo')
                    and coalesce(a.due_at, t.due_at) between now() and now() + make_interval(hours => k.remind_hours)),
    'warnings_unseen', (select count(*) from public.staff_warnings where staff_id = v_me and seen_at is null and cancelled_at is null),
    'warnings_active', (select count(*) from public.staff_warnings where staff_id = v_me and cancelled_at is null and created_at > now() - make_interval(days => k.warn_window_days)),
    'sectors', (select count(*) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.staff_id = v_me and m.active),
    'heads', (select count(*) from public.sector_members m join public.sectors s on s.id = m.sector_id and not s.archived where m.staff_id = v_me and m.is_head and m.active),
    'to_review', (select count(*) from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
                   where t.status = 'open' and a.state = 'submitted'
                     and (v_all or exists (select 1 from public.sector_members h where h.sector_id = t.sector_id and h.staff_id = v_me and h.is_head and h.active))),
    'requests', (select count(*) from public.staff_task_requests r join public.staff_tasks t on t.id = r.task_id
                  where r.status = 'pending'
                    and (v_all or exists (select 1 from public.sector_members h where h.sector_id = t.sector_id and h.staff_id = v_me and h.is_head and h.active))),
    'appeals', case when v_all then (select count(*) from public.staff_warnings where appeal_status = 'pending') else 0 end,
    'unread', (select count(*) from public.staff_inbox where staff_id = v_me and read_at is null),
    'oversees', v_all);
end $$;

/** Every 10 minutes: reminders before a deadline and warnings after it, by the team rules. */
create or replace function private.staff_task_sweep() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k public.team_settings := private.team_rules();
  r record;
begin
  for r in
    update public.staff_task_assignees a set reminded_at = now()
      from public.staff_tasks t
     where t.id = a.task_id and t.status = 'open' and a.submitted_at is null and a.state <> 'approved' and a.reminded_at is null
       and coalesce(a.due_at, t.due_at) between now() and now() + make_interval(hours => k.remind_hours)
    returning a.staff_id, t.title, coalesce(a.due_at, t.due_at) as due_at
  loop
    perform private.notify_staff_users(array[r.staff_id], '⏰ الميعاد قرّب: ' || r.title,
      'آخر ميعاد ' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || '. محتاج وقت؟ اطلب مد الميعاد من التاسك.', '/app/#/staff/mytasks');
  end loop;
  for r in
    update public.staff_task_assignees a set missed_at = now()
      from public.staff_tasks t
     where t.id = a.task_id and t.status = 'open' and a.submitted_at is null and a.state <> 'approved' and a.missed_at is null
       and coalesce(a.due_at, t.due_at) + make_interval(mins => k.grace_minutes) < now()
    returning a.staff_id, t.id as task_id, t.sector_id, t.title, coalesce(a.due_at, t.due_at) as due_at, t.warn_on_miss, t.created_by
  loop
    if r.warn_on_miss and k.auto_warn then
      insert into public.staff_warnings (staff_id, sector_id, task_id, kind, reason)
      values (r.staff_id, r.sector_id, r.task_id, 'missed',
              'ما سلّمتش تاسك «' || left(r.title, 140) || '» في ميعاده (' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || ').')
      on conflict do nothing;
      if not found then
        -- Missed again after an extension (the first warning was cancelled): a new warning, not tied to the task row.
        insert into public.staff_warnings (staff_id, sector_id, kind, reason)
        values (r.staff_id, r.sector_id, 'missed',
                'ما سلّمتش تاسك «' || left(r.title, 140) || '» حتى بعد مد الميعاد (' || to_char(r.due_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI') || ').');
      end if;
    else
      perform private.notify_staff_users(array[r.staff_id], 'فات ميعاد: ' || r.title, 'لسه تقدر تسلّمه متأخر.', '/app/#/staff/mytasks');
    end if;
    perform private.notify_staff_users(private.sector_heads(r.sector_id) || r.created_by,
      private.staff_name(r.staff_id) || ' ما سلّمش: ' || r.title, case when r.warn_on_miss and k.auto_warn then 'اتبعتله إنذار تلقائي.' else 'الميعاد فات.' end,
      '/app/#/staff/sectors/' || r.sector_id || '/' || r.task_id);
  end loop;
end $$;
revoke execute on function private.staff_task_sweep() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_team_settings()', 'public.staff_team_settings_save(jsonb)',
    'public.staff_task_request(uuid, text, text, timestamptz)', 'public.staff_task_request_decide(uuid, boolean, text, timestamptz)',
    'public.staff_warning_appeal(uuid, text)', 'public.staff_warning_appeal_decide(uuid, boolean, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
