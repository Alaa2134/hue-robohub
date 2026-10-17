-- Forms can ask for a file (photo, PDF or short video) and can have a background picture or video.
-- Files from visitors go to the private bucket `form-files` through a one-time ticket: the visitor asks
-- for a path (the form must be open, the question must be a file question, type and size are checked,
-- and each IP is limited), then uploads exactly that path within an hour. The answer is accepted only if
-- the path is an unused ticket of that form and question and the object really exists. Backgrounds go
-- to the public bucket `form-media`, written only by whoever manages forms. The app compresses images
-- and videos in the browser before either upload.

alter table public.forms add column if not exists background_path text check (background_path is null or background_path ~ '^b/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');
alter table public.forms add column if not exists background_kind text check (background_kind is null or background_kind in ('image', 'video'));

create table if not exists private.form_uploads (
  path text primary key,
  form_id uuid not null references public.forms (id) on delete cascade,
  field_id text not null,
  mime text not null,
  size bigint not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists form_uploads_form_idx on private.form_uploads (form_id);
alter table private.form_uploads enable row level security;
revoke all on private.form_uploads from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-files', 'form-files', false, 31457280, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-media', 'form-media', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

/** A visitor asks to upload one file for a file question; the answer is the path they may upload to (once, within an hour). */
create or replace function public.form_upload_ticket(p_slug text, p_field text, p_mime text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
  fld jsonb;
  v_accept text;
  v_mimes text[];
  v_max bigint;
  v_ext text;
  v_path text;
begin
  if not private.throttle('formfile', 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into f from public.forms where slug = lower(btrim(p_slug)) and not archived;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not private.form_is_open(f) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  select x into fld from jsonb_array_elements(f.fields) x where x ->> 'id' = p_field and x ->> 'type' = 'file' limit 1;
  if fld is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  v_accept := coalesce(fld ->> 'accept', 'image');
  v_mimes := case v_accept
    when 'image' then array['image/jpeg', 'image/png', 'image/webp']
    when 'pdf' then array['application/pdf']
    when 'video' then array['video/mp4', 'video/webm']
    else array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'] end;
  if not (p_mime = any(v_mimes)) then return jsonb_build_object('ok', false, 'error', 'type'); end if;
  v_max := case when p_mime like 'image/%' then 4194304 when p_mime = 'application/pdf' then 10485760 else 31457280 end;
  if p_size is null or p_size <= 0 or p_size > v_max then return jsonb_build_object('ok', false, 'error', 'size', 'max', v_max); end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
                       when 'application/pdf' then 'pdf' when 'video/mp4' then 'mp4' else 'webm' end;
  v_path := 'f/' || f.id || '/' || gen_random_uuid() || '.' || v_ext;
  insert into private.form_uploads (path, form_id, field_id, mime, size) values (v_path, f.id, p_field, p_mime, p_size);
  return jsonb_build_object('ok', true, 'path', v_path);
end $$;

/** Storage asks this before accepting an anonymous upload: only a fresh, unused ticket's exact path. */
create or replace function public.form_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.form_uploads u where u.path = p_name and u.used_at is null and u.created_at > now() - interval '1 hour')
$$;

/** Whether a path in an answer is a ticket for this form and question that was uploaded and not used by another answer. */
create or replace function private.form_file_ok(p_form uuid, p_field text, p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.form_uploads u join storage.objects o on o.bucket_id = 'form-files' and o.name = u.path
     where u.path = p_path and u.form_id = p_form and u.field_id = p_field and u.used_at is null)
$$;

revoke execute on function public.form_upload_ticket(text, text, text, bigint), public.form_upload_ok(text), private.form_file_ok(uuid, text, text) from public;
grant execute on function public.form_upload_ticket(text, text, text, bigint) to anon, authenticated;
grant execute on function public.form_upload_ok(text) to anon, authenticated;

create policy form_files_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'form-files' and public.form_upload_ok(name));
create policy form_files_select on storage.objects for select to authenticated
  using (bucket_id = 'form-files' and ((select private.can_read('forms')) or (select private.is_admin())));
create policy form_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-files' and (select private.is_admin()));
create policy form_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'form-media' and ((select private.can('forms')) or (select private.is_admin())));
create policy form_media_update on storage.objects for update to authenticated
  using (bucket_id = 'form-media' and ((select private.can('forms')) or (select private.is_admin())));
create policy form_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-media' and ((select private.can('forms')) or (select private.is_admin())));

-- submit_form: a file answer must be one of this form's unused, really uploaded tickets (then the ticket is used up).
select private.patch_function('public.submit_form(text, jsonb, text, text)'::regprocedure,
  'v_errors jsonb := ''{}'';',
  'v_errors jsonb := ''{}'';
  v_files text[] := ''{}'';');
select private.patch_function('public.submit_form(text, jsonb, text, text)'::regprocedure,
  'v_text := case when v_type = ''checkbox''',
  'if v_type = ''file'' then
      v_text := nullif(btrim(v_val #>> ''{}''), '''');
      if v_text is null then
        if coalesce((fld ->> ''required'')::boolean, false) then v_errors := v_errors || jsonb_build_object(v_id, ''required''); end if;
      elsif private.form_file_ok(f.id, v_id, v_text) then
        v_files := array_append(v_files, v_text);
        v_clean := v_clean || jsonb_build_object(v_id, v_text);
      else
        v_errors := v_errors || jsonb_build_object(v_id, ''file'');
      end if;
      continue;
    end if;
    v_text := case when v_type = ''checkbox''');
select private.patch_function('public.submit_form(text, jsonb, text, text)'::regprocedure,
  'returning ref into v_text;',
  'returning ref into v_text;
  update private.form_uploads set used_at = now() where path = any(v_files);');
select private.patch_function('public.public_form(text)'::regprocedure,
  '''open'', private.form_is_open(f), ''opens_at'', f.opens_at, ''closes_at'', f.closes_at',
  '''open'', private.form_is_open(f), ''opens_at'', f.opens_at, ''closes_at'', f.closes_at,
    ''background_path'', f.background_path, ''background_kind'', f.background_kind');
