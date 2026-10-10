-- Stronger team tasks: a conversation on each task, a checklist the member ticks, files with the
-- hand-in (private bucket "team-tasks"), tasks that repeat every week, two weeks or month, and
-- ready-made task templates per sector (or for the whole team).

-- ─────────────────────────────────────────────────────────── comments
create table public.staff_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  staff_id uuid not null references public.staff (user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index staff_task_comments_task_idx on public.staff_task_comments (task_id, created_at);
create index staff_task_comments_staff_idx on public.staff_task_comments (staff_id);
alter table public.staff_task_comments enable row level security;
revoke all on public.staff_task_comments from anon, authenticated;

/** On this task: its sector's head (or an overseer), or someone it was given to. */
create or replace function private.task_party(p_task uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and (
    exists (select 1 from public.staff_task_assignees a where a.task_id = p_task and a.staff_id = auth.uid())
    or exists (select 1 from public.staff_tasks t where t.id = p_task and private.leads_sector(t.sector_id)))
$$;
revoke execute on function private.task_party(uuid) from public, anon;
grant execute on function private.task_party(uuid) to authenticated;

/** A message on a task. A member's message goes to the heads; a head's to the members on it. */
create or replace function public.staff_task_comment(p_task uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
  v_lead boolean;
begin
  select * into t from public.staff_tasks where id = p_task;
  if t.id is null or not private.task_party(p_task) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.staff_task_comments (task_id, staff_id, body) values (p_task, auth.uid(), btrim(p_body));
  v_lead := private.leads_sector(t.sector_id);
  perform private.notify_staff_users(
    array_remove(case when v_lead then array(select staff_id from public.staff_task_assignees where task_id = p_task and not excused)
                      else private.sector_heads(t.sector_id) || t.created_by end, auth.uid()),
    '💬 ' || private.staff_name(auth.uid()) || ' · ' || t.title, left(btrim(p_body), 200),
    case when v_lead then '/app/#/staff/mytasks' else '/app/#/staff/sectors/' || t.sector_id || '/' || t.id end);
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────── checklist, repeat, files
alter table public.staff_tasks
  add column if not exists checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 20),
  add column if not exists repeat text not null default 'none' check (repeat in ('none', 'weekly', 'biweekly', 'monthly')),
  add column if not exists repeated_at timestamptz;
alter table public.staff_task_assignees
  add column if not exists checked jsonb not null default '[]' check (jsonb_typeof(checked) = 'array'),
  add column if not exists files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 5);

/** Heads: a task's checklist ([{id, text}]) and whether it repeats. */
create or replace function public.staff_task_extras(p_task uuid, p_checklist jsonb, p_repeat text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
begin
  select * into t from public.staff_tasks where id = p_task;
  if t.id is null or not private.leads_sector(t.sector_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_tasks
     set checklist = coalesce((select jsonb_agg(jsonb_build_object('id', left(e ->> 'id', 20), 'text', left(btrim(e ->> 'text'), 200)))
                                 from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) as e
                                where coalesce(btrim(e ->> 'text'), '') <> '' and coalesce(e ->> 'id', '') <> ''), '[]'::jsonb),
         repeat = coalesce(p_repeat, 'none')
   where id = p_task;
  return jsonb_build_object('ok', true);
end $$;

/** The member ticks (or unticks) a checklist item. */
create or replace function public.staff_task_check(p_task uuid, p_item text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.staff_task_assignees a
     set checked = case when p_done then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(a.checked || to_jsonb(left(p_item, 20))) as x)
                        else coalesce((select jsonb_agg(x) from jsonb_array_elements_text(a.checked) as x where x <> p_item), '[]'::jsonb) end,
         state = case when a.state = 'todo' and p_done then 'doing' else a.state end
   where a.task_id = p_task and a.staff_id = auth.uid();
  return jsonb_build_object('ok', found);
end $$;

-- Files: team-tasks/<task>/<member>/<file>. The member uploads to their own folder; the member and the
-- sector's heads can read. Nothing is ever overwritten or removed from the app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-tasks', 'team-tasks', false, 20971520, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/zip', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'video/mp4'])
on conflict (id) do nothing;

/** May this person write (their own folder, on a task given to them) or read this task file path? */
create or replace function private.task_file_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_task uuid;
  v_owner uuid;
begin
  if not private.is_staff() or coalesce(array_length(v_parts, 1), 0) < 2 then
    return false;
  end if;
  begin
    v_task := v_parts[1]::uuid;
    v_owner := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  if p_write then
    return v_owner = auth.uid() and exists (
      select 1 from public.staff_task_assignees a join public.staff_tasks t on t.id = a.task_id
       where a.task_id = v_task and a.staff_id = auth.uid() and t.status = 'open' and a.state <> 'approved');
  end if;
  return (v_owner = auth.uid() and exists (select 1 from public.staff_task_assignees a where a.task_id = v_task and a.staff_id = auth.uid()))
      or exists (select 1 from public.staff_tasks t where t.id = v_task and private.leads_sector(t.sector_id));
end $$;
revoke execute on function private.task_file_ok(text, boolean) from public, anon;
grant execute on function private.task_file_ok(text, boolean) to authenticated;

create policy team_tasks_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-tasks' and (select private.task_file_ok(name, true)));
create policy team_tasks_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'team-tasks' and (select private.task_file_ok(name, false)));

/** The member's files for this task ([{path, name, size}]), checked against their own folder. */
create or replace function public.staff_task_attach(p_task uuid, p_files jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text := p_task::text || '/' || auth.uid()::text || '/';
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 5
     or exists (select 1 from jsonb_array_elements(p_files) as e where left(e ->> 'path', length(v_prefix)) <> v_prefix) then
    raise exception 'bad files' using errcode = '22023';
  end if;
  update public.staff_task_assignees
     set files = (select coalesce(jsonb_agg(jsonb_build_object('path', e ->> 'path', 'name', left(e ->> 'name', 120), 'size', (e ->> 'size')::bigint)), '[]'::jsonb)
                    from jsonb_array_elements(p_files) as e)
   where task_id = p_task and staff_id = auth.uid() and state <> 'approved';
  return jsonb_build_object('ok', found);
end $$;

-- ─────────────────────────────────────────────────────────── repeating tasks
/** When a repeating task's deadline passes, the next one is given to the same (still active) members. */
create or replace function private.staff_task_repeat() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.staff_tasks;
  v_id uuid;
  v_due timestamptz;
  v_who uuid[];
begin
  for t in
    update public.staff_tasks set repeated_at = now()
     where repeat <> 'none' and repeated_at is null and status <> 'cancelled' and due_at < now()
    returning *
  loop
    v_due := t.due_at + case t.repeat when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end;
    while v_due < now() + interval '1 hour' loop
      v_due := v_due + case t.repeat when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end;
    end loop;
    v_who := array(select a.staff_id from public.staff_task_assignees a
                     join public.sector_members m on m.sector_id = t.sector_id and m.staff_id = a.staff_id and m.active
                     join public.staff s on s.user_id = a.staff_id and s.active
                    where a.task_id = t.id and not (a.excused and a.submitted_at is null));
    continue when cardinality(v_who) = 0 or exists (select 1 from public.sectors where id = t.sector_id and archived);
    insert into public.staff_tasks (sector_id, title, description, link, priority, due_at, warn_on_miss, created_by, checklist, repeat)
    values (t.sector_id, t.title, t.description, t.link, t.priority, v_due, t.warn_on_miss, t.created_by, t.checklist, t.repeat)
    returning id into v_id;
    insert into public.staff_task_assignees (task_id, staff_id) select v_id, x from unnest(v_who) as x;
    perform private.notify_staff_users(v_who, '🔁 ' || t.title, 'تاسك متكرر · آخر ميعاد ' || to_char(v_due at time zone 'Africa/Cairo', 'DD/MM HH24:MI'), '/app/#/staff/mytasks');
  end loop;
end $$;
revoke execute on function private.staff_task_repeat() from public, anon, authenticated;
select private.patch_function('private.staff_task_sweep()',
  $p$  r record;
begin
$p$,
  $p$  r record;
begin
  perform private.staff_task_repeat();
$p$);

-- ─────────────────────────────────────────────────────────── templates
create table public.staff_task_templates (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid references public.sectors (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  link text check (link is null or (link ~* '^https://[^[:space:]]+$' and char_length(link) <= 300)),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 20),
  days int not null default 3 check (days between 0 and 90),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index staff_task_templates_sector_idx on public.staff_task_templates (sector_id);
create index staff_task_templates_created_by_idx on public.staff_task_templates (created_by);
alter table public.staff_task_templates enable row level security;
revoke all on public.staff_task_templates from anon, authenticated;

/** Templates a head can use in this sector: the sector's own and the whole team's. */
create or replace function public.staff_task_templates(p_sector uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.leads_sector(p_sector) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.sector_id nulls last, x.title)
                     from public.staff_task_templates x where not x.archived and (x.sector_id = p_sector or x.sector_id is null)), '[]'::jsonb);
end $$;

/** Heads save a template for their sector; overseers can also save one for the whole team (no sector). */
create or replace function public.staff_task_template_save(p_id uuid, p_sector uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_sector uuid := p_sector;
begin
  if p_id is not null then
    select sector_id into v_sector from public.staff_task_templates where id = p_id;
  end if;
  if (v_sector is null and not private.oversees()) or (v_sector is not null and not private.leads_sector(v_sector)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.staff_task_templates (sector_id, title, description, link, priority, checklist, days)
    values (v_sector, btrim(p ->> 'title'), coalesce(btrim(p ->> 'description'), ''), nullif(btrim(p ->> 'link'), ''),
            coalesce(p ->> 'priority', 'normal'), coalesce(p -> 'checklist', '[]'::jsonb), coalesce((p ->> 'days')::int, 3))
    returning id into v_id;
  else
    update public.staff_task_templates
       set title = btrim(p ->> 'title'), description = coalesce(btrim(p ->> 'description'), ''), link = nullif(btrim(p ->> 'link'), ''),
           priority = coalesce(p ->> 'priority', 'normal'), checklist = coalesce(p -> 'checklist', '[]'::jsonb),
           days = coalesce((p ->> 'days')::int, 3), archived = coalesce((p ->> 'archived')::boolean, false)
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Comments in the task JSON.
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
        from public.staff_task_requests r where r.task_id = t.id and (p_all or r.staff_id = auth.uid())), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'staff_id', c.staff_id, 'name', private.staff_name(c.staff_id), 'body', c.body, 'created_at', c.created_at)
                       order by c.created_at)
        from public.staff_task_comments c where c.task_id = t.id), '[]'::jsonb))
$$;
revoke execute on function private.task_json(public.staff_tasks, boolean) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.staff_task_comment(uuid, text)', 'public.staff_task_extras(uuid, jsonb, text)', 'public.staff_task_check(uuid, text, boolean)',
    'public.staff_task_attach(uuid, jsonb)', 'public.staff_task_templates(uuid)', 'public.staff_task_template_save(uuid, uuid, jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
