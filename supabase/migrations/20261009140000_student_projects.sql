-- Students show what they built: a project (title, what it does, a link, a photo) sent from the app
-- goes to whoever handles website content, who publishes it on the site's projects page (or declines
-- it with a note). The photo is uploaded to the private "submissions" bucket under projects/; the
-- reviewer's app copies it to the public site bucket when publishing.

create table public.student_projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  url text check (url is null or (url ~* '^https://[^[:space:]]+$' and char_length(url) <= 300)),
  photo_path text check (photo_path is null or photo_path ~ '^projects/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$'),
  status text not null default 'pending' check (status in ('pending', 'published', 'declined')),
  note text check (char_length(note) <= 300),
  site_content_id uuid references public.site_content (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_projects_student_idx on public.student_projects (student_id, created_at desc);
create index student_projects_status_idx on public.student_projects (status, created_at desc);
create index student_projects_reviewed_by_idx on public.student_projects (reviewed_by);
create index student_projects_site_content_idx on public.student_projects (site_content_id);
alter table public.student_projects enable row level security;
create policy student_projects_select on public.student_projects for select to authenticated using ((select private.can('content')));
grant select on public.student_projects to authenticated;
revoke all on public.student_projects from anon;

-- Reviewers (website content) can open project photos in the private bucket.
alter policy submissions_objects_select on storage.objects
  using (bucket_id = 'submissions' and ((select private.can('students')) or ((select private.can('content')) and name like 'projects/%')));

/** Edge Function only (student-upload): where a student's project photo goes. */
create or replace function public.student_project_upload_ticket(p_token text, p_ext text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_ext text := lower(regexp_replace(coalesce(p_ext, ''), '[^a-zA-Z0-9]', '', 'g'));
begin
  if not private.throttle('project_upload:' || v_id, 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_ext not in ('jpg', 'jpeg', 'png', 'webp', 'heic') then
    return jsonb_build_object('ok', false, 'error', 'type');
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    return jsonb_build_object('ok', false, 'error', 'too_big');
  end if;
  return jsonb_build_object('ok', true, 'path', 'projects/' || v_id || '/' || gen_random_uuid() || '.' || v_ext);
end $$;
revoke execute on function public.student_project_upload_ticket(text, text, bigint) from public, anon, authenticated;
grant execute on function public.student_project_upload_ticket(text, text, bigint) to service_role;

/** Student: send a project for the website (at most three waiting at once). */
create or replace function public.student_project_submit(p_token text, p_title text, p_description text, p_url text, p_photo text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_name text;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
begin
  if not private.throttle('project_submit:' || v_id, 5, interval '1 day') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from public.student_projects where student_id = v_id and status = 'pending') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  if v_url is not null and v_url !~* '^https://' then
    v_url := 'https://' || regexp_replace(v_url, '^[a-z]+://', '', 'i');
  end if;
  if v_photo is not null and (v_photo not like 'projects/' || v_id || '/%'
      or not exists (select 1 from storage.objects o where o.bucket_id = 'submissions' and o.name = v_photo)) then
    return jsonb_build_object('ok', false, 'error', 'photo');
  end if;
  insert into public.student_projects (student_id, title, description, url, photo_path)
  values (v_id, btrim(p_title), left(btrim(coalesce(p_description, '')), 2000), v_url, v_photo);
  select full_name into v_name from public.students where id = v_id;
  perform private.notify_staff('content', 'مشروع طالب جديد 🛠️', btrim(p_title) || ' · ' || v_name, '/app/#/staff/projects');
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;
revoke execute on function public.student_project_submit(text, text, text, text, text) from public;
grant execute on function public.student_project_submit(text, text, text, text, text) to anon, authenticated;

/** Student: what they sent and what happened to it. */
create or replace function public.student_projects_mine(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'note', p.note, 'at', p.created_at,
             'slug', (select c.slug from public.site_content c where c.id = p.site_content_id and c.published)) order by p.created_at desc)
      from public.student_projects p where p.student_id = v_id
  ), '[]'::jsonb);
end $$;
revoke execute on function public.student_projects_mine(text) from public;
grant execute on function public.student_projects_mine(text) to anon, authenticated;

/** Reviewer: pending projects with the student's name and group. */
create or replace function public.staff_student_projects() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can('content') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description, 'url', p.url, 'photo', p.photo_path,
             'at', p.created_at, 'student', s.full_name, 'group', s.group_name) order by p.created_at)
      from public.student_projects p join public.students s on s.id = p.student_id
     where p.status = 'pending'
  ), '[]'::jsonb);
end $$;
revoke execute on function public.staff_student_projects() from public, anon;
grant execute on function public.staff_student_projects() to authenticated;

/** Reviewer: record the decision (the app writes the website item first when publishing). */
create or replace function public.staff_review_project(p_id uuid, p_status text, p_note text default null, p_site uuid default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can('content') or p_status not in ('published', 'declined') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.student_projects
     set status = p_status, note = left(nullif(btrim(coalesce(p_note, '')), ''), 300), site_content_id = p_site,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending';
end $$;
revoke execute on function public.staff_review_project(uuid, text, text, uuid) from public, anon;
grant execute on function public.staff_review_project(uuid, text, text, uuid) to authenticated;
