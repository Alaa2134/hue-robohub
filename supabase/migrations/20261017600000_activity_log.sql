-- The leader's activity log: every add, change and delete anyone makes (team, students, visitors) on
-- every working table, with what changed (old → new), a snapshot of what was deleted (so it can be put
-- back), the person's name and the record's name at that moment. Only the owner reads it; nobody can
-- change or remove an entry.

alter table public.audit_log add column if not exists ip text;
alter table public.audit_log alter column ip set default private.client_ip();
create index if not exists audit_log_actor_idx on public.audit_log (actor, id desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, id desc);

alter policy audit_select on public.audit_log using ((select private.is_owner()));

-- Values never shown in the log (card tokens and the like), kept apart only to put a deleted row back.
create table if not exists private.audit_secrets (
  audit_id bigint primary key references public.audit_log (id),
  data jsonb not null
);

-- A value as it shows in the log: long text cut, big lists/objects reduced to their size.
create or replace function private.audit_val(v jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' and char_length(v #>> '{}') > 500 then to_jsonb(left(v #>> '{}', 500) || '…')
    when jsonb_typeof(v) in ('object', 'array') and octet_length(v::text) > 1500 then jsonb_build_object('_big', octet_length(v::text))
    else v
  end
$$;

-- Who/what a row belongs to, by name: the student, the team member, the quiz/task/form/… it's under.
create or replace function private.audit_ctx(r jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o jsonb := '{}';
  v text;
  s text;
begin
  if r ->> 'student_id' is not null then
    select full_name into v from public.students where id = (r ->> 'student_id')::uuid;
    o := o || jsonb_build_object('st', v);
  end if;
  s := coalesce(r ->> 'staff_id', r ->> 'staff_user_id');
  if s is not null then
    select coalesce(nullif(full_name, ''), email) into v from public.staff where user_id = s::uuid;
    o := o || jsonb_build_object('sf', v);
  end if;
  v := case
    when r ->> 'quiz_id' is not null then (select title from public.quizzes where id = (r ->> 'quiz_id')::uuid)
    when r ->> 'assignment_id' is not null then (select title from public.assignments where id = (r ->> 'assignment_id')::uuid)
    when r ->> 'session_id' is not null then (select title from public.attendance_sessions where id = (r ->> 'session_id')::uuid)
    when r ->> 'task_id' is not null then (select title from public.staff_tasks where id = (r ->> 'task_id')::uuid)
    when r ->> 'item_id' is not null then (select name from public.inventory_items where id = (r ->> 'item_id')::uuid)
    when r ->> 'form_id' is not null then (select title_ar from public.forms where id = (r ->> 'form_id')::uuid)
    when r ->> 'event_id' is not null then (select coalesce(title_ar, title) from public.site_content where id = (r ->> 'event_id')::uuid)
    when r ->> 'meeting_id' is not null then (select title from public.sector_meetings where id = (r ->> 'meeting_id')::uuid)
    when r ->> 'material_id' is not null then (select title from public.materials where id = (r ->> 'material_id')::uuid)
    when r ->> 'page_id' is not null then (select title_ar from public.site_pages where id = (r ->> 'page_id')::uuid)
    when r ->> 'profile_id' is not null then (select full_name from public.team_profiles where id = (r ->> 'profile_id')::uuid)
    when r ->> 'sector_id' is not null then (select name from public.sectors where id = (r ->> 'sector_id')::uuid)
  end;
  if v is not null then
    o := o || jsonb_build_object('of', left(v, 160));
  end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(o) where value <> 'null'::jsonb);
exception when others then
  return o;
end $$;

create or replace function private.audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c_secret constant text := '(^|_)(pin|pins|password|passcode|secret|token|otp)(_|$)|_hash$';
  v_ignore text[] := array['updated_at', 'updated_by', 'created_at', 'code_key', 'barcode_key', 'renew_reminded_at',
                           'reminded_at', 'low_notified_at', 'weekly_awarded_at', 'repeated_at', 'last_repeat_at',
                           'saved_at', 'delivered', 'failed', 'targets', 'seen_at', 'read_at', 'overdue_at']
                     || coalesce(tg_argv::text[], '{}');
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_by text;
  v_ch jsonb := '{}';
  v_show jsonb;
  v_secret jsonb;
  v_cut boolean := false;
  v_detail jsonb;
  v_id bigint;
  k text;
begin
  -- Only the one trigger per table below logs (the older per-table triggers now do nothing).
  if tg_name <> 'audit_all' or current_setting('buildx.audit_skip', true) = 'on' then
    return null;
  end if;
  -- Rows changed by cascades and other triggers follow from an action already logged.
  if pg_trigger_depth() > 1 and tg_op <> 'INSERT' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := v_old;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_row := v_new;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
  end if;

  v_by := case
    when v_uid is not null then null
    when v_role = 'anon' then case when v_row ->> 'student_id' is not null then 'student' else 'visitor' end
    else 'system'
  end;
  -- Background jobs keep reminders and counters current; that isn't anyone's action.
  if v_by = 'system' and tg_op = 'UPDATE' then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      continue when k = any (v_ignore) or (v_old -> k) is not distinct from (v_new -> k);
      v_ch := v_ch || jsonb_build_object(k, case when k ~ c_secret then '["•••", "•••"]'::jsonb
                                                 else jsonb_build_array(private.audit_val(v_old -> k), private.audit_val(v_new -> k)) end);
    end loop;
    if v_ch = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    select coalesce(jsonb_object_agg(key, private.audit_val(value)), '{}') into v_show
      from jsonb_each(v_new) where key <> all (v_ignore) and key !~ c_secret and value <> 'null'::jsonb;
  else
    select coalesce(jsonb_object_agg(key, value), '{}') into v_show from jsonb_each(v_old) where key !~ c_secret;
    select jsonb_object_agg(key, value) into v_secret from jsonb_each(v_old) where key ~ c_secret and value <> 'null'::jsonb;
    if octet_length(v_show::text) > 200000 then
      select jsonb_object_agg(key, private.audit_val(value)) into v_show from jsonb_each(v_show);
      v_cut := true;
    end if;
  end if;

  v_detail := jsonb_build_object(
    't', left(coalesce(v_row ->> 'full_name', v_row ->> 'recipient_name', v_row ->> 'borrower_name', v_row ->> 'name',
                       v_row ->> 'title_ar', v_row ->> 'title', v_row ->> 'ref', v_row ->> 'slug', v_row ->> 'key',
                       v_row ->> 'email', v_row ->> 'code', v_row ->> 'month', v_row ->> 'group_name', v_row ->> 'prompt'), 160),
    'by', v_by,
    'an', (select coalesce(nullif(full_name, ''), email) from public.staff where user_id = v_uid),
    'ch', case when tg_op = 'UPDATE' then v_ch end,
    'row', v_show,
    'cut', case when v_cut then true end
  );
  v_detail := (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(v_detail) where value <> 'null'::jsonb)
              || private.audit_ctx(v_row);

  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (v_uid, auth.jwt() ->> 'email', lower(tg_op), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'key', v_row ->> 'email', v_row ->> 'group_name'), v_detail)
  returning id into v_id;
  if v_secret is not null then
    insert into private.audit_secrets (audit_id, data) values (v_id, v_secret);
  end if;
  return null;
exception when others then
  -- The log never stops the action it records.
  begin
    insert into public.audit_log (actor, actor_email, action, entity, detail)
    values (auth.uid(), auth.jwt() ->> 'email', lower(tg_op), tg_table_name, jsonb_build_object('err', left(sqlerrm, 200)));
  exception when others then
    null;
  end;
  return null;
end $$;

-- One trigger per working table (logs, device tokens, counters and saved versions left out).
do $$
declare
  t record;
begin
  for t in select * from (values
      ('access_requests', ''), ('announcements', ''), ('applications', ''), ('assignment_submissions', ''),
      ('assignments', ''), ('attendance', ''), ('attendance_sessions', ''), ('certificates', ''),
      ('community_bans', ''), ('course_bonus', ''), ('deletion_requests', ''), ('directory_sites', ''),
      ('directory_suggestions', ''), ('email_suppressions', ''), ('event_feedback', ''), ('event_member_checkins', ''),
      ('event_registrations', ''), ('family_members', ''), ('form_responses', ''), ('forms', ''),
      ('inbox_messages', ''), ('inventory_items', ''), ('inventory_loans', ''), ('inventory_requests', ''),
      ('materials', ''), ('push_messages', ''), ('quiz_attempts', 'answers'), ('quiz_questions', ''),
      ('quizzes', ''), ('sector_meeting_attendance', ''), ('sector_meetings', ''), ('sector_members', ''),
      ('sectors', ''), ('site_content', ''), ('site_pages', ''), ('site_settings', ''), ('staff', ''),
      ('staff_task_assignees', ''), ('staff_task_comments', ''), ('staff_task_requests', ''),
      ('staff_task_templates', ''), ('staff_tasks', ''), ('staff_warnings', ''), ('student_bonus', ''),
      ('student_projects', ''), ('students', ''), ('team_awards', ''), ('team_profiles', ''),
      ('team_projects', ''), ('team_settings', ''), ('voice_clips', ''), ('waitlist', ''), ('whatsapp_snippets', '')
    ) as x(name, ignore) loop
    execute format('create or replace trigger audit_all after insert or update or delete on public.%I for each row execute function private.audit(%s)',
                   t.name, case when t.ignore = '' then '' else quote_literal(t.ignore) end);
  end loop;
end $$;

-- Sign-ins: team members (called by the app right after signing in) and students.
create or replace function public.staff_log_login()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  select coalesce(nullif(full_name, ''), email) into v_name from public.staff where user_id = auth.uid() and active;
  if not found or exists (select 1 from public.audit_log where actor = auth.uid() and action = 'login' and at > now() - interval '10 minutes') then
    return;
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'login', 'staff', auth.uid()::text, jsonb_build_object('an', v_name, 't', v_name));
end $$;
revoke all on function public.staff_log_login() from public, anon;
grant execute on function public.staff_log_login() to authenticated;

do $$
begin
  if pg_get_functiondef('public.student_login(text,text)'::regprocedure) !~ 'action = ''login''' then
    perform private.patch_function('public.student_login(text,text)',
      $p$  v_token := encode(extensions.gen_random_bytes(32), 'hex');$p$,
      $p$  if not exists (select 1 from public.audit_log where entity = 'students' and entity_id = v_st.id::text and action = 'login'
                   and at > now() - interval '10 minutes') then
    insert into public.audit_log (action, entity, entity_id, detail)
    values ('login', 'students', v_st.id::text, jsonb_build_object('by', 'student', 'st', v_st.full_name, 't', v_st.full_name));
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');$p$);
  end if;
end $$;

-- The leader's page: the list (newest first, filtered), one entry in full, numbers, and putting a
-- deleted row back.
create or replace function public.staff_audit_list(p jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 60), 1), 200);
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_like text;
  v_rows jsonb;
  v_more boolean;
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with x as (
    select a.* from public.audit_log a
     where (p ->> 'before' is null or a.id < (p ->> 'before')::bigint)
       and (p ->> 'from' is null or a.at >= (p ->> 'from')::timestamptz)
       and (p ->> 'to' is null or a.at < (p ->> 'to')::timestamptz)
       and (p ->> 'entity' is null or a.entity = p ->> 'entity')
       and (p ->> 'kind' is null or case when p ->> 'kind' = 'other' then a.action not in ('insert', 'update', 'delete')
                                         else a.action = p ->> 'kind' end)
       and (p ->> 'who' is null or case p ->> 'who'
              when 'team' then a.actor is not null
              when 'visitor' then a.detail ->> 'by' = 'visitor'
              when 'student' then a.detail ->> 'by' = 'student'
              when 'system' then a.actor is null and coalesce(a.detail ->> 'by', 'system') = 'system'
              else a.actor::text = p ->> 'who' end)
       and (v_q is null or a.detail::text ilike v_like or a.actor_email ilike v_like or a.entity_id = v_q or a.ip = v_q)
     order by a.id desc
     limit v_limit + 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', x.id, 'at', x.at, 'actor', x.actor, 'actor_email', x.actor_email, 'action', x.action,
           'entity', x.entity, 'entity_id', x.entity_id, 'detail', x.detail - 'row', 'has_row', x.detail ? 'row',
           'restored', x.action = 'delete' and exists (select 1 from public.audit_log r where r.action = 'restore' and r.detail ->> 'from' = x.id::text))
         order by x.id desc),
         count(*) > v_limit
    into v_rows, v_more
    from (select * from x order by id desc) x;
  if v_more then
    v_rows := v_rows - v_limit;
  end if;
  return jsonb_build_object('rows', coalesce(v_rows, '[]'), 'more', coalesce(v_more, false));
end $$;

create or replace function public.staff_audit_get(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a public.audit_log%rowtype;
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from public.audit_log where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', a.id, 'at', a.at, 'actor', a.actor, 'actor_email', a.actor_email, 'action', a.action, 'entity', a.entity,
    'entity_id', a.entity_id, 'ip', a.ip, 'detail', a.detail,
    'restored', (select jsonb_build_object('at', r.at, 'by', coalesce(r.detail ->> 'an', r.actor_email))
                   from public.audit_log r where r.action = 'restore' and r.detail ->> 'from' = a.id::text order by r.id limit 1),
    'can_restore', a.action = 'delete' and a.detail ? 'row' and not coalesce((a.detail ->> 'cut')::boolean, false)
                   and exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                                where n.nspname = 'public' and c.relname = a.entity and t.tgname = 'audit_all'));
end $$;

create or replace function public.staff_audit_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  v_week timestamptz := now() - interval '7 days';
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', (select jsonb_build_object(
                'insert', count(*) filter (where action = 'insert'), 'update', count(*) filter (where action = 'update'),
                'delete', count(*) filter (where action = 'delete'), 'other', count(*) filter (where action not in ('insert', 'update', 'delete')),
                'total', count(*))
              from public.audit_log where at >= v_today),
    'week', (select jsonb_build_object(
                'insert', count(*) filter (where action = 'insert'), 'update', count(*) filter (where action = 'update'),
                'delete', count(*) filter (where action = 'delete'), 'other', count(*) filter (where action not in ('insert', 'update', 'delete')),
                'total', count(*))
              from public.audit_log where at >= v_week),
    'top', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (
              select a.actor, coalesce(max(nullif(s.full_name, '')), max(a.detail ->> 'an'), max(a.actor_email)) as name,
                     count(*) as n, count(*) filter (where a.action = 'delete') as deletes
                from public.audit_log a left join public.staff s on s.user_id = a.actor
               where a.at >= v_week and a.actor is not null
               group by a.actor order by count(*) desc limit 6) x),
    'people', (select coalesce(jsonb_agg(x order by x.name), '[]') from (
              select a.actor, coalesce(max(nullif(s.full_name, '')), max(a.detail ->> 'an'), max(a.actor_email)) as name, count(*) as n
                from public.audit_log a left join public.staff s on s.user_id = a.actor
               where a.actor is not null group by a.actor) x),
    'entities', (select coalesce(jsonb_object_agg(entity, n), '{}') from (select entity, count(*) n from public.audit_log group by entity) x),
    'total', (select count(*) from public.audit_log),
    'since', (select min(at) from public.audit_log)
  );
end $$;

create or replace function public.staff_audit_restore(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.audit_log%rowtype;
  v_rec jsonb;
  v_cols text;
begin
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into a from public.audit_log where id = p_id for update;
  if not found or a.action <> 'delete' or not (a.detail ? 'row') or coalesce((a.detail ->> 'cut')::boolean, false)
     or not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = a.entity and t.tgname = 'audit_all') then
    return jsonb_build_object('ok', false, 'error', 'cannot');
  end if;
  if exists (select 1 from public.audit_log r where r.action = 'restore' and r.detail ->> 'from' = a.id::text) then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;
  v_rec := (a.detail -> 'row') || coalesce((select data from private.audit_secrets where audit_id = a.id), '{}');
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
    from pg_attribute
   where attrelid = format('public.%I', a.entity)::regclass and attnum > 0 and not attisdropped and attgenerated = ''
     and v_rec ? attname::text;
  perform set_config('buildx.audit_skip', 'on', true);
  begin
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I, $1)',
                   a.entity, v_cols, v_cols, a.entity) using v_rec;
  exception
    when unique_violation then
      perform set_config('buildx.audit_skip', 'off', true);
      return jsonb_build_object('ok', false, 'error', 'exists');
    when foreign_key_violation then
      perform set_config('buildx.audit_skip', 'off', true);
      return jsonb_build_object('ok', false, 'error', 'parent');
    when others then
      perform set_config('buildx.audit_skip', 'off', true);
      return jsonb_build_object('ok', false, 'error', 'failed', 'detail', left(sqlerrm, 200));
  end;
  perform set_config('buildx.audit_skip', 'off', true);
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'restore', a.entity, a.entity_id,
          jsonb_build_object('from', a.id, 't', a.detail ->> 't',
                             'an', (select coalesce(nullif(full_name, ''), email) from public.staff where user_id = auth.uid()))
          || private.audit_ctx(a.detail -> 'row'));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.staff_audit_list(jsonb) from public, anon;
revoke all on function public.staff_audit_get(bigint) from public, anon;
revoke all on function public.staff_audit_stats() from public, anon;
revoke all on function public.staff_audit_restore(bigint) from public, anon;
grant execute on function public.staff_audit_list(jsonb) to authenticated;
grant execute on function public.staff_audit_get(bigint) to authenticated;
grant execute on function public.staff_audit_stats() to authenticated;
grant execute on function public.staff_audit_restore(bigint) to authenticated;
revoke all on function private.audit_val(jsonb) from public, anon, authenticated;
revoke all on function private.audit_ctx(jsonb) from public, anon, authenticated;
