-- BuildX Lab (/lab): circuits, code, blocks and 3D designs that members build in the browser.
--
-- Who is working: a student (the opaque token from student_login, passed as p_token) or a team member
-- (Supabase Auth, p_token null). Tables are closed to direct access (RLS on, no policies); every read
-- and write goes through the functions below, which check ownership, membership or visibility.
-- Saves are optimistic: the client sends the revision it started from and gets "conflict" (never a
-- silent overwrite) when someone saved in between.

create table public.lab_projects (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('student', 'staff')),
  owner_id uuid not null,
  kind text not null check (kind in ('circuit', 'code', 'blocks', 'cad')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  category text check (category is null or char_length(category) <= 40),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  share_token text unique check (share_token is null or share_token ~ '^[0-9a-f]{32}$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 3000000),
  revision int not null default 1,
  thumbnail text check (thumbnail is null or (thumbnail ~ '^data:image/(svg\+xml|png|webp|jpeg);base64,' and char_length(thumbnail) <= 400000)),
  cloned_from uuid references public.lab_projects (id) on delete set null,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  updated_by_kind text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index lab_projects_owner_idx on public.lab_projects (owner_kind, owner_id, updated_at desc);
create index lab_projects_public_idx on public.lab_projects (visibility, updated_at desc) where deleted_at is null and hidden_reason is null;
create index lab_projects_cloned_idx on public.lab_projects (cloned_from);
alter table public.lab_projects enable row level security;
revoke all on public.lab_projects from anon, authenticated;

create table public.lab_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lab_projects (id) on delete cascade,
  revision int not null,
  title text not null,
  data jsonb not null,
  note text check (note is null or char_length(note) <= 200),
  by_kind text not null,
  by_id uuid not null,
  created_at timestamptz not null default now()
);
create index lab_versions_project_idx on public.lab_project_versions (project_id, created_at desc);
alter table public.lab_project_versions enable row level security;
revoke all on public.lab_project_versions from anon, authenticated;

-- Collaborators other than the owner.
create table public.lab_members (
  project_id uuid not null references public.lab_projects (id) on delete cascade,
  member_kind text not null check (member_kind in ('student', 'staff')),
  member_id uuid not null,
  role text not null check (role in ('editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (project_id, member_kind, member_id)
);
create index lab_members_member_idx on public.lab_members (member_kind, member_id);
alter table public.lab_members enable row level security;
revoke all on public.lab_members from anon, authenticated;

create table public.lab_favorites (
  actor_kind text not null,
  actor_id uuid not null,
  project_id uuid not null references public.lab_projects (id) on delete cascade,
  active boolean not null default true,
  at timestamptz not null default now(),
  primary key (actor_kind, actor_id, project_id)
);
create index lab_favorites_project_idx on public.lab_favorites (project_id) where active;
alter table public.lab_favorites enable row level security;
revoke all on public.lab_favorites from anon, authenticated;

-- What people actually did (compiles, simulation runs, exports…): the dashboard's numbers and
-- achievements are counted from here, never estimated.
create table public.lab_activity (
  id bigint generated always as identity primary key,
  actor_kind text not null,
  actor_id uuid not null,
  project_id uuid references public.lab_projects (id) on delete set null,
  kind text not null check (kind in ('create', 'save', 'compile_ok', 'compile_error', 'sim_run', 'export', 'clone', 'restore', 'share', 'lesson_done', 'challenge_pass')),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000),
  at timestamptz not null default now()
);
create index lab_activity_actor_idx on public.lab_activity (actor_kind, actor_id, at desc);
create index lab_activity_project_idx on public.lab_activity (project_id, at desc);
alter table public.lab_activity enable row level security;
revoke all on public.lab_activity from anon, authenticated;

/** The person behind a Lab call: a student by token, else a signed-in team member. */
create or replace function private.lab_actor(p_token text, out kind text, out id uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_token is not null and p_token <> '' then
    kind := 'student';
    id := private.session_student(p_token);
    return;
  end if;
  select 'staff', s.user_id into kind, id from public.staff s where s.user_id = auth.uid() and s.active;
  if id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function private.lab_actor(text) from public, anon, authenticated;

/** Same, but nobody signed in is fine (public pages): kind and id stay null. */
create or replace function private.lab_viewer(p_token text, out kind text, out id uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (p_token is not null and p_token <> '') or exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active) then
    select a.kind, a.id into kind, id from private.lab_actor(p_token) a;
  end if;
end $$;
revoke execute on function private.lab_viewer(text) from public, anon, authenticated;

/** Instructors (trainers) and admins: classrooms, moderation and Lab analytics. */
create or replace function private.lab_instructor() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_admin() or private.can('tasks') $$;
revoke execute on function private.lab_instructor() from public, anon, authenticated;

/** What this person may do with a project: owner, editor, viewer (a member, or anyone for public and
 *  link-shared projects) or nothing. Deleted and moderated-away projects are only their owner's. */
create or replace function private.lab_role(p_project public.lab_projects, p_kind text, p_id uuid, p_share text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text;
begin
  if p_kind is not null and p_project.owner_kind = p_kind and p_project.owner_id = p_id then
    return 'owner';
  end if;
  if p_project.deleted_at is not null then
    return null;
  end if;
  if p_kind is not null then
    select m.role into v_role from public.lab_members m where m.project_id = p_project.id and m.member_kind = p_kind and m.member_id = p_id;
    if v_role is not null then
      return v_role;
    end if;
  end if;
  if p_project.hidden_reason is null and (p_project.visibility = 'public'
      or (p_project.visibility = 'unlisted' and p_share is not null and p_project.share_token = p_share)) then
    return 'viewer';
  end if;
  return null;
end $$;
revoke execute on function private.lab_role(public.lab_projects, text, uuid, text) from public, anon, authenticated;

/** Display name: students show their first name only outside their own account. */
create or replace function private.lab_name(p_kind text, p_id uuid, p_full boolean default false) returns text
language sql stable security definer set search_path = ''
as $$
  select case p_kind
    when 'student' then (select case when p_full then s.full_name else split_part(btrim(s.full_name), ' ', 1) end from public.students s where s.id = p_id)
    when 'staff' then (select coalesce(nullif(btrim(st.full_name), ''), 'BuildX') from public.staff st where st.user_id = p_id)
  end
$$;
revoke execute on function private.lab_name(text, uuid, boolean) from public, anon, authenticated;

create or replace function private.lab_log(p_kind text, p_id uuid, p_project uuid, p_event text, p_detail jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.lab_activity (actor_kind, actor_id, project_id, kind, detail) values (p_kind, p_id, p_project, p_event, coalesce(p_detail, '{}'::jsonb))
$$;
revoke execute on function private.lab_log(text, uuid, uuid, text, jsonb) from public, anon, authenticated;

/** Keep the project's current design as a version; the 50th and later reuse the oldest slot. */
create or replace function private.lab_keep_version(p public.lab_projects, p_note text, p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old uuid;
begin
  if (select count(*) from public.lab_project_versions where project_id = p.id) >= 50 then
    select id into v_old from public.lab_project_versions where project_id = p.id order by created_at limit 1;
    update public.lab_project_versions set revision = p.revision, title = p.title, data = p.data, note = p_note, by_kind = p_kind, by_id = p_id, created_at = now()
     where id = v_old;
  else
    insert into public.lab_project_versions (project_id, revision, title, data, note, by_kind, by_id)
    values (p.id, p.revision, p.title, p.data, p_note, p_kind, p_id);
  end if;
end $$;
revoke execute on function private.lab_keep_version(public.lab_projects, text, text, uuid) from public, anon, authenticated;

/** Card fields of a project (no design data). */
create or replace function private.lab_card(p public.lab_projects, p_kind text, p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'title', p.title, 'description', p.description, 'tags', to_jsonb(p.tags), 'category', p.category,
    'visibility', p.visibility, 'thumbnail', p.thumbnail, 'revision', p.revision, 'created_at', p.created_at, 'updated_at', p.updated_at,
    'deleted_at', p.deleted_at, 'hidden', p.hidden_reason is not null,
    'mine', p_kind is not null and p.owner_kind = p_kind and p.owner_id = p_id,
    'owner', private.lab_name(p.owner_kind, p.owner_id),
    'favorite', p_kind is not null and exists (select 1 from public.lab_favorites f where f.actor_kind = p_kind and f.actor_id = p_id and f.project_id = p.id and f.active),
    'favorites', (select count(*) from public.lab_favorites f where f.project_id = p.id and f.active))
$$;
revoke execute on function private.lab_card(public.lab_projects, text, uuid) from public, anon, authenticated;

/** Who is in the Lab right now. */
create or replace function public.lab_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
begin
  select * into a from private.lab_actor(p_token);
  return jsonb_build_object('kind', a.kind, 'id', a.id, 'name', private.lab_name(a.kind, a.id, true),
    'instructor', a.kind = 'staff' and private.lab_instructor(), 'admin', a.kind = 'staff' and private.is_admin());
end $$;

/** My projects (and the ones shared with me), newest first. Filter: kind, q, favorites, deleted, shared. */
create or replace function public.lab_projects_list(p_token text, p_filter jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
  v_q text := nullif(btrim(coalesce(p_filter ->> 'q', '')), '');
  v_kind text := nullif(p_filter ->> 'kind', '');
  v_fav boolean := coalesce((p_filter ->> 'favorites')::boolean, false);
  v_trash boolean := coalesce((p_filter ->> 'deleted')::boolean, false);
  v_shared boolean := coalesce((p_filter ->> 'shared')::boolean, false);
  v_sort text := coalesce(p_filter ->> 'sort', 'updated');
begin
  select * into a from private.lab_actor(p_token);
  return coalesce((
    select jsonb_agg(private.lab_card(p, a.kind, a.id) order by
             case when v_sort = 'title' then lower(p.title) end,
             case when v_sort = 'created' then p.created_at end desc,
             p.updated_at desc)
      from public.lab_projects p
     where (case when v_shared
              then p.deleted_at is null and exists (select 1 from public.lab_members m where m.project_id = p.id and m.member_kind = a.kind and m.member_id = a.id)
              else p.owner_kind = a.kind and p.owner_id = a.id and (p.deleted_at is not null) = v_trash end)
       and (v_kind is null or p.kind = v_kind)
       and (v_q is null or p.title ilike '%' || v_q || '%' or p.description ilike '%' || v_q || '%' or v_q = any (p.tags))
       and (not v_fav or exists (select 1 from public.lab_favorites f where f.actor_kind = a.kind and f.actor_id = a.id and f.project_id = p.id and f.active))
  ), '[]'::jsonb);
end $$;

/** One project with its design, if this person may see it (p_share: the link token of an unlisted one). */
create or replace function public.lab_project_get(p_token text, p_id uuid, p_share text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v record;
  p public.lab_projects;
  v_role text;
begin
  select * into v from private.lab_viewer(p_token);
  select * into p from public.lab_projects where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_role := private.lab_role(p, v.kind, v.id, p_share);
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'role', v_role, 'project', private.lab_card(p, v.kind, v.id)
    || jsonb_build_object('data', p.data, 'share_token', case when v_role = 'owner' then p.share_token end, 'cloned_from', p.cloned_from,
                          'updated_by', private.lab_name(p.updated_by_kind, p.updated_by)));
end $$;

/** A new project. */
create or replace function public.lab_project_create(p_token text, p_kind text, p_title text, p_data jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  v_id uuid;
begin
  select * into a from private.lab_actor(p_token);
  if not private.throttle('lab_create:' || a.id, 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from public.lab_projects where owner_kind = a.kind and owner_id = a.id and deleted_at is null) >= 300 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.lab_projects (owner_kind, owner_id, kind, title, description, tags, category, data, thumbnail, updated_by_kind, updated_by)
  values (a.kind, a.id, p_kind, btrim(coalesce(nullif(btrim(p_title), ''), 'Untitled')), coalesce(p_meta ->> 'description', ''),
          coalesce(array(select left(btrim(t), 30) from jsonb_array_elements_text(coalesce(p_meta -> 'tags', '[]'::jsonb)) t where btrim(t) <> '' limit 12), '{}'),
          nullif(p_meta ->> 'category', ''), coalesce(p_data, '{}'::jsonb), p_meta ->> 'thumbnail', a.kind, a.id)
  returning id into v_id;
  perform private.lab_log(a.kind, a.id, v_id, 'create', jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'id', v_id, 'revision', 1);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/**
 * Save the design. p_base: the revision the editor started from; someone else's newer save comes back
 * as "conflict" with who saved it, and nothing is written. A version is kept on request (p_snapshot)
 * and at least every 15 minutes of editing, 50 at most per project.
 */
create or replace function public.lab_project_save(p_token text, p_id uuid, p_base int, p_data jsonb, p_meta jsonb default '{}'::jsonb, p_snapshot text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
  v_role text;
begin
  select * into a from private.lab_actor(p_token);
  if not private.throttle('lab_save:' || a.id, 600, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into p from public.lab_projects where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_role := private.lab_role(p, a.kind, a.id, null);
  if v_role is null or v_role = 'viewer' or p.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p.revision <> p_base then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'revision', p.revision, 'by', private.lab_name(p.updated_by_kind, p.updated_by), 'at', p.updated_at);
  end if;
  if p_snapshot is not null or not exists (
      select 1 from public.lab_project_versions v where v.project_id = p.id and v.created_at > now() - interval '15 minutes') then
    perform private.lab_keep_version(p, left(nullif(btrim(p_snapshot), ''), 200), a.kind, a.id);
  end if;
  update public.lab_projects set
    data = coalesce(p_data, data),
    title = coalesce(nullif(btrim(p_meta ->> 'title'), ''), title),
    thumbnail = case when p_meta ? 'thumbnail' then p_meta ->> 'thumbnail' else thumbnail end,
    revision = revision + 1, updated_at = now(), updated_by_kind = a.kind, updated_by = a.id
  where id = p.id;
  return jsonb_build_object('ok', true, 'revision', p.revision + 1);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** Owner: title, description, tags, category, visibility (an unlisted project gets a link token). */
create or replace function public.lab_project_settings(p_token text, p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
  v_vis text;
begin
  select * into a from private.lab_actor(p_token);
  select * into p from public.lab_projects where id = p_id and owner_kind = a.kind and owner_id = a.id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_vis := coalesce(p_patch ->> 'visibility', p.visibility);
  update public.lab_projects set
    title = coalesce(nullif(btrim(p_patch ->> 'title'), ''), title),
    description = coalesce(p_patch ->> 'description', description),
    tags = case when p_patch ? 'tags' then coalesce(array(select left(btrim(t), 30) from jsonb_array_elements_text(p_patch -> 'tags') t where btrim(t) <> '' limit 12), '{}') else tags end,
    category = case when p_patch ? 'category' then nullif(p_patch ->> 'category', '') else category end,
    visibility = v_vis,
    share_token = case when v_vis = 'unlisted' then coalesce(share_token, encode(extensions.gen_random_bytes(16), 'hex'))
                       when coalesce((p_patch ->> 'new_link')::boolean, false) then null else share_token end,
    updated_at = now()
  where id = p.id;
  if v_vis <> p.visibility then
    perform private.lab_log(a.kind, a.id, p.id, 'share', jsonb_build_object('visibility', v_vis));
  end if;
  return jsonb_build_object('ok', true, 'share_token', (select share_token from public.lab_projects where id = p.id));
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

/** Owner: move to the trash, or bring back from it. */
create or replace function public.lab_project_trash(p_token text, p_id uuid, p_trash boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
begin
  select * into a from private.lab_actor(p_token);
  update public.lab_projects set deleted_at = case when p_trash then now() end, updated_at = now()
   where id = p_id and owner_kind = a.kind and owner_id = a.id;
  return jsonb_build_object('ok', found);
end $$;

/** A copy of any project this person can see (their own, shared, public or by link) in their account. */
create or replace function public.lab_project_clone(p_token text, p_id uuid, p_share text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
  v_id uuid;
begin
  select * into a from private.lab_actor(p_token);
  if not private.throttle('lab_create:' || a.id, 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into p from public.lab_projects where id = p_id;
  if not found or private.lab_role(p, a.kind, a.id, p_share) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into public.lab_projects (owner_kind, owner_id, kind, title, description, tags, category, data, thumbnail, cloned_from, updated_by_kind, updated_by)
  values (a.kind, a.id, p.kind, left(p.title, 112) || case when p.owner_kind = a.kind and p.owner_id = a.id then ' (2)' else '' end,
          p.description, p.tags, p.category, p.data, p.thumbnail, p.id, a.kind, a.id)
  returning id into v_id;
  perform private.lab_log(a.kind, a.id, v_id, 'clone', jsonb_build_object('from', p.id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

/** Saved versions of a project. */
create or replace function public.lab_versions(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
begin
  select * into a from private.lab_actor(p_token);
  select * into p from public.lab_projects where id = p_id;
  if not found or private.lab_role(p, a.kind, a.id, null) not in ('owner', 'editor') then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'revision', v.revision, 'title', v.title, 'note', v.note,
                                                       'at', v.created_at, 'by', private.lab_name(v.by_kind, v.by_id)) order by v.created_at desc)
                     from public.lab_project_versions v where v.project_id = p_id), '[]'::jsonb);
end $$;

/** Bring back a saved version (what was there is kept as a version first). */
create or replace function public.lab_version_restore(p_token text, p_id uuid, p_version uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
  v public.lab_project_versions;
begin
  select * into a from private.lab_actor(p_token);
  select * into p from public.lab_projects where id = p_id for update;
  if not found or private.lab_role(p, a.kind, a.id, null) not in ('owner', 'editor') or p.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v from public.lab_project_versions where id = p_version and project_id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform private.lab_keep_version(p, 'before restore', a.kind, a.id);
  update public.lab_projects set data = v.data, revision = revision + 1, updated_at = now(), updated_by_kind = a.kind, updated_by = a.id where id = p.id;
  perform private.lab_log(a.kind, a.id, p.id, 'restore', jsonb_build_object('version', v.id));
  return jsonb_build_object('ok', true, 'revision', p.revision + 1);
end $$;

create or replace function public.lab_favorite(p_token text, p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  p public.lab_projects;
begin
  select * into a from private.lab_actor(p_token);
  select * into p from public.lab_projects where id = p_id;
  if not found or private.lab_role(p, a.kind, a.id, null) is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into public.lab_favorites (actor_kind, actor_id, project_id, active) values (a.kind, a.id, p_id, p_on)
  on conflict (actor_kind, actor_id, project_id) do update set active = excluded.active, at = now();
  return jsonb_build_object('ok', true);
end $$;

/** Record something that happened in the editor (compiles, simulation runs, exports). */
create or replace function public.lab_event(p_token text, p_project uuid, p_kind text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
begin
  select * into a from private.lab_actor(p_token);
  if p_kind not in ('compile_ok', 'compile_error', 'sim_run', 'export') then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if not private.throttle('lab_event:' || a.id, 400, interval '1 hour') then
    return;
  end if;
  if p_project is not null and not exists (select 1 from public.lab_projects p where p.id = p_project and private.lab_role(p, a.kind, a.id, null) is not null) then
    p_project := null;
  end if;
  perform private.lab_log(a.kind, a.id, p_project, p_kind, coalesce(p_detail, '{}'::jsonb) - 'source');
end $$;

/** Dashboard: counts from this person's own projects and activity. */
create or replace function public.lab_dashboard(p_token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
begin
  select * into a from private.lab_actor(p_token);
  return jsonb_build_object(
    'projects', (select jsonb_object_agg(k, n) from (select kind k, count(*) n from public.lab_projects
                   where owner_kind = a.kind and owner_id = a.id and deleted_at is null group by kind) x),
    'activity', (select jsonb_object_agg(k, n) from (select kind k, count(*) n from public.lab_activity
                   where actor_kind = a.kind and actor_id = a.id group by kind) x),
    'sim_seconds', (select coalesce(sum(least((detail ->> 'seconds')::numeric, 86400)), 0) from public.lab_activity
                     where actor_kind = a.kind and actor_id = a.id and kind = 'sim_run' and jsonb_typeof(detail -> 'seconds') = 'number'),
    'days', (select count(distinct (at at time zone 'Africa/Cairo')::date) from public.lab_activity where actor_kind = a.kind and actor_id = a.id),
    'recent', coalesce((select jsonb_agg(c order by (c ->> 'updated_at') desc) from (
                select private.lab_card(p, a.kind, a.id) c from public.lab_projects p
                 where p.owner_kind = a.kind and p.owner_id = a.id and p.deleted_at is null order by p.updated_at desc limit 6) r), '[]'::jsonb),
    'public', coalesce((select jsonb_agg(c) from (
                select private.lab_card(p, a.kind, a.id) c from public.lab_projects p
                 where p.visibility = 'public' and p.deleted_at is null and p.hidden_reason is null
                 order by (select count(*) from public.lab_favorites f where f.project_id = p.id and f.active) desc, p.updated_at desc limit 6) r), '[]'::jsonb));
end $$;

/** Public gallery: projects their owners made public (newest or most saved). Anyone can browse. */
create or replace function public.lab_gallery(p_token text, p_filter jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v record;
  v_q text := nullif(btrim(coalesce(p_filter ->> 'q', '')), '');
  v_kind text := nullif(p_filter ->> 'kind', '');
  v_sort text := coalesce(p_filter ->> 'sort', 'new');
begin
  select * into v from private.lab_viewer(p_token);
  return coalesce((
    select jsonb_agg(c) from (
      select private.lab_card(p, v.kind, v.id) c from public.lab_projects p
       where p.visibility = 'public' and p.deleted_at is null and p.hidden_reason is null
         and (v_kind is null or p.kind = v_kind)
         and (v_q is null or p.title ilike '%' || v_q || '%' or p.description ilike '%' || v_q || '%' or v_q = any (p.tags))
       order by case when v_sort = 'popular' then (select count(*) from public.lab_favorites f where f.project_id = p.id and f.active) end desc nulls last, p.updated_at desc
       limit 60) r
  ), '[]'::jsonb);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'lab_me(text)', 'lab_projects_list(text, jsonb)', 'lab_project_get(text, uuid, text)', 'lab_project_create(text, text, text, jsonb, jsonb)',
    'lab_project_save(text, uuid, int, jsonb, jsonb, text)', 'lab_project_settings(text, uuid, jsonb)', 'lab_project_trash(text, uuid, boolean)',
    'lab_project_clone(text, uuid, text)', 'lab_versions(text, uuid)', 'lab_version_restore(text, uuid, uuid)', 'lab_favorite(text, uuid, boolean)',
    'lab_event(text, uuid, text, jsonb)', 'lab_dashboard(text)', 'lab_gallery(text, jsonb)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
