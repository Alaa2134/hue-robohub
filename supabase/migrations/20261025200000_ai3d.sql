-- BuildX 3D AI: anyone types a description (or uploads a photo) and gets a 3D model they can turn
-- around, download (GLB, and STL/OBJ made in the browser) and 3D-print. It is paid with credits:
-- the customer opens a wallet (name + phone, no password: the browser keeps a secret key), buys a
-- package by Vodafone Cash / InstaPay and uploads the receipt; the team approves it in the app and
-- the credits are added. One model costs the credits set in the app, taken when it starts and given
-- back if it fails.
--
-- The models are made by Meshy (meshy.ai) through its API, called from here with pg_net like the
-- WhatsApp messages: the API key is kept in Vault (set by the owner in the app, never readable),
-- a job moves queued → shaping → texturing → saving → done, one request at a time, advanced every
-- minute by cron and more often while the customer watches. When it is done the ai3d-keep function
-- copies the model and its picture into our own storage, so the links don't expire.
--
-- Until the owner adds the key and turns it on, the page shows the service but takes no orders.

-- ─────────────────────────────────────────────────────────────── settings
create table if not exists private.ai3d_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  key_secret uuid,
  ai_model text check (ai_model is null or ai_model ~ '^[a-z0-9.-]{1,30}$'),
  cost_text int not null default 1 check (cost_text between 1 and 100),
  cost_image int not null default 1 check (cost_image between 1 and 100),
  textured boolean not null default true,
  packages jsonb not null default '[{"credits": 1, "price": 60}, {"credits": 5, "price": 250}, {"credits": 12, "price": 500}]'::jsonb
    check (jsonb_typeof(packages) = 'array' and jsonb_array_length(packages) between 1 and 6),
  pay_ar text check (char_length(pay_ar) <= 600),
  pay_en text check (char_length(pay_en) <= 600),
  free_credits int not null default 0 check (free_credits between 0 and 5),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into private.ai3d_settings (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── wallets, top-ups, jobs
create table if not exists public.ai3d_wallets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^X3D-[0-9A-F]{8}$'),
  token_hash text not null unique,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  credits int not null default 0 check (credits >= 0),
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create table if not exists public.ai3d_topups (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.ai3d_wallets (id) on delete cascade,
  credits int not null check (credits between 1 and 1000),
  amount numeric(10, 2) not null check (amount >= 0),
  method text not null check (method in ('vodafone_cash', 'instapay', 'other')),
  sender text check (char_length(sender) <= 80),
  receipt text check (char_length(receipt) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (char_length(note) <= 300),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai3d_topups_wallet on public.ai3d_topups (wallet_id, created_at desc);
create index if not exists ai3d_topups_pending on public.ai3d_topups (created_at) where status = 'pending';

create table if not exists public.ai3d_jobs (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.ai3d_wallets (id) on delete set null,
  staff_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('text', 'image')),
  prompt text check (char_length(prompt) <= 600),
  style text not null default 'realistic' check (style in ('realistic', 'cartoon', 'lowpoly', 'sculpture')),
  image_data text check (char_length(image_data) <= 2000000),
  status text not null default 'queued' check (status in ('queued', 'shaping', 'texturing', 'saving', 'done', 'failed')),
  progress int not null default 0 check (progress between 0 and 100),
  task_preview text,
  task_final text,
  req bigint,
  req_kind text,
  remote jsonb,
  glb text,
  thumb text,
  error text,
  credits int not null default 0,
  refunded boolean not null default false,
  public boolean not null default false,
  featured boolean not null default false,
  keep_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check (kind = 'image' or char_length(btrim(coalesce(prompt, ''))) >= 3)
);
create index if not exists ai3d_jobs_wallet on public.ai3d_jobs (wallet_id, created_at desc);
create index if not exists ai3d_jobs_active on public.ai3d_jobs (created_at) where status not in ('done', 'failed');
create index if not exists ai3d_jobs_featured on public.ai3d_jobs (finished_at desc) where featured;

alter table public.ai3d_wallets enable row level security;
alter table public.ai3d_topups enable row level security;
alter table public.ai3d_jobs enable row level security;
revoke all on public.ai3d_wallets, public.ai3d_topups, public.ai3d_jobs from anon, authenticated;

do $$ begin
if not exists (select 1 from pg_trigger where tgname = 'ai3d_wallets_audit') then
  create trigger ai3d_wallets_audit after insert or update on public.ai3d_wallets for each row execute function private.audit();
end if;
if not exists (select 1 from pg_trigger where tgname = 'ai3d_topups_audit') then
  create trigger ai3d_topups_audit after insert or update on public.ai3d_topups for each row execute function private.audit();
end if;
end $$;

-- ─────────────────────────────────────────────────────────────── storage
-- Receipts (private, staff read them) and the finished models (public, behind random paths).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai3d', 'ai3d', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai3d-models', 'ai3d-models', true, 104857600, array['model/gltf-binary', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists private.ai3d_uploads (
  path text primary key,
  wallet_id uuid not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create or replace function public.ai3d_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.ai3d_uploads u where u.path = p_name and u.used_at is null and u.created_at > now() - interval '1 hour')
$$;
revoke all on function public.ai3d_upload_ok(text) from public;
grant execute on function public.ai3d_upload_ok(text) to anon, authenticated;

do $$ begin
if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ai3d_insert') then
  create policy ai3d_insert on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'ai3d' and public.ai3d_upload_ok(name));
end if;
if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ai3d_select') then
  create policy ai3d_select on storage.objects for select to authenticated
    using (bucket_id = 'ai3d' and (select private.can_read('ai3d')));
end if;
end $$;

-- ─────────────────────────────────────────────────────────────── helpers
create or replace function private.ai3d_wallet(p_token text) returns public.ai3d_wallets
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets;
begin
  if p_token is null or char_length(p_token) <> 48 then
    raise exception 'wallet_invalid' using errcode = 'P0001';
  end if;
  select * into w from public.ai3d_wallets where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or w.blocked then
    raise exception 'wallet_invalid' using errcode = 'P0001';
  end if;
  if w.seen_at < now() - interval '10 minutes' then
    update public.ai3d_wallets set seen_at = now() where id = w.id;
  end if;
  return w;
end $$;
revoke all on function private.ai3d_wallet(text) from public, anon, authenticated;

create or replace function private.ai3d_key() returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.id = (select key_secret from private.ai3d_settings where id = 1)
$$;
revoke all on function private.ai3d_key() from public, anon, authenticated;

/** The job as the customer (or the team) sees it. */
create or replace function private.ai3d_job_json(j public.ai3d_jobs) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', j.id, 'kind', j.kind, 'prompt', j.prompt, 'style', j.style, 'status', j.status,
    'progress', j.progress, 'glb', j.glb, 'thumb', j.thumb, 'remote_glb', case when j.glb is null then j.remote ->> 'glb' end,
    'remote_thumb', case when j.thumb is null then j.remote ->> 'thumb' end, 'error', j.error, 'credits', j.credits,
    'refunded', j.refunded, 'public', j.public, 'featured', j.featured, 'created_at', j.created_at, 'finished_at', j.finished_at)
$$;

create or replace function private.ai3d_fail(p_id uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.ai3d_jobs;
begin
  update public.ai3d_jobs set status = 'failed', error = left(coalesce(nullif(btrim(p_error), ''), 'failed'), 300), req = null,
         image_data = null, updated_at = now(), finished_at = now()
   where id = p_id and status not in ('done', 'failed')
  returning * into j;
  if found and j.wallet_id is not null and j.credits > 0 and not j.refunded then
    update public.ai3d_wallets set credits = credits + j.credits where id = j.wallet_id;
    update public.ai3d_jobs set refunded = true where id = p_id;
  end if;
end $$;
revoke all on function private.ai3d_fail(uuid, text) from public, anon, authenticated;

create or replace function private.ai3d_send(p_id uuid, p_kind text, p_url text, p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.ai3d_key();
  v_req bigint;
begin
  if v_key is null then
    perform private.ai3d_fail(p_id, 'no_key');
    return;
  end if;
  if p_body is null then
    v_req := net.http_get(url := p_url, headers := jsonb_build_object('Authorization', 'Bearer ' || v_key), timeout_milliseconds := 20000);
  else
    v_req := net.http_post(url := p_url, body := p_body,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), timeout_milliseconds := 30000);
  end if;
  update public.ai3d_jobs set req = v_req, req_kind = p_kind, updated_at = now() where id = p_id;
end $$;
revoke all on function private.ai3d_send(uuid, text, text, jsonb) from public, anon, authenticated;

/** Ask ai3d-keep to copy the finished model into our storage (it checks the one-time token). */
create or replace function private.ai3d_keep(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.ai3d_jobs set keep_token = v_token, updated_at = now() where id = p_id;
  perform net.http_post(
    url := 'https://zrtfupdnfxxnguznphis.supabase.co/functions/v1/ai3d-keep',
    body := jsonb_build_object('id', p_id, 'token', v_token),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000);
end $$;
revoke all on function private.ai3d_keep(uuid) from public, anon, authenticated;

/**
 * One step for one job: read the answer to the last request, or send the next request. Called by
 * cron every minute and while someone is watching the job.
 */
create or replace function private.ai3d_advance(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.ai3d_jobs;
  s private.ai3d_settings;
  r record;
  b jsonb;
  v_status text;
  v_prog int;
  v_base text;
  v_prompt text;
  v_body jsonb;
begin
  select * into j from public.ai3d_jobs where id = p_id for update skip locked;
  if not found or j.status in ('done', 'failed') then return; end if;
  select * into s from private.ai3d_settings where id = 1;
  v_base := case when j.kind = 'text' then 'https://api.meshy.ai/openapi/v2/text-to-3d' else 'https://api.meshy.ai/openapi/v1/image-to-3d' end;

  if j.created_at < now() - interval '45 minutes' and j.status <> 'saving' then
    perform private.ai3d_fail(j.id, 'timeout');
    return;
  end if;

  -- 1. The answer to the last request.
  if j.req is not null then
    select status_code, content, error_msg, timed_out into r from net._http_response where id = j.req;
    if not found then
      if j.updated_at < now() - interval '3 minutes' then
        update public.ai3d_jobs set req = null, updated_at = now() where id = j.id;
      end if;
      return;
    end if;
    update public.ai3d_jobs set req = null where id = j.id;
    b := case when r.content ~ '^\s*\{' then r.content::jsonb end;
    if r.status_code is null or r.status_code >= 500 or r.status_code = 429 then
      -- Their side or the network: try again on the next step (polls), or fail a create after a while.
      if j.req_kind like 'create%' and j.created_at < now() - interval '10 minutes' then
        perform private.ai3d_fail(j.id, coalesce(b ->> 'message', r.error_msg, 'provider_unavailable'));
      else
        update public.ai3d_jobs set req_kind = null, updated_at = now() where id = j.id;
      end if;
      return;
    end if;
    if r.status_code >= 400 then
      perform private.ai3d_fail(j.id, coalesce(b ->> 'message', 'provider_error_' || r.status_code));
      return;
    end if;
    if j.req_kind = 'create_preview' then
      update public.ai3d_jobs set task_preview = b ->> 'result', status = 'shaping', progress = 2, updated_at = now() where id = j.id;
    elsif j.req_kind = 'create_final' then
      update public.ai3d_jobs set task_final = b ->> 'result', status = 'texturing', updated_at = now() where id = j.id;
    elsif j.req_kind = 'create_image' then
      update public.ai3d_jobs set task_final = b ->> 'result', status = 'shaping', progress = 2, image_data = null, updated_at = now() where id = j.id;
    elsif j.req_kind = 'poll' then
      v_status := b ->> 'status';
      v_prog := least(100, greatest(0, coalesce((b ->> 'progress')::int, 0)));
      if v_status = 'SUCCEEDED' then
        if j.kind = 'text' and j.task_final is null and s.textured then
          -- The shape is ready: now the colours and textures.
          update public.ai3d_jobs set progress = 50, updated_at = now() where id = j.id;
          perform private.ai3d_send(j.id, 'create_final', v_base,
            jsonb_build_object('mode', 'refine', 'preview_task_id', j.task_preview, 'enable_pbr', true));
        else
          update public.ai3d_jobs set status = 'saving', progress = 98, updated_at = now(),
                 remote = jsonb_strip_nulls(jsonb_build_object('glb', b #>> '{model_urls,glb}', 'obj', b #>> '{model_urls,obj}',
                   'fbx', b #>> '{model_urls,fbx}', 'usdz', b #>> '{model_urls,usdz}', 'thumb', b ->> 'thumbnail_url'))
           where id = j.id;
          if b #>> '{model_urls,glb}' is null then
            perform private.ai3d_fail(j.id, 'no_model');
          else
            perform private.ai3d_keep(j.id);
          end if;
        end if;
      elsif v_status in ('FAILED', 'CANCELED', 'EXPIRED') then
        perform private.ai3d_fail(j.id, coalesce(b #>> '{task_error,message}', lower(v_status)));
      else
        update public.ai3d_jobs
           set progress = case when j.kind = 'text' and s.textured then (case when j.task_final is null then v_prog / 2 else 50 + v_prog / 2 end)
                               else v_prog end,
               updated_at = now()
         where id = j.id;
      end if;
    end if;
    return;
  end if;

  -- 2. The next request.
  if j.status = 'queued' then
    if j.kind = 'text' then
      v_prompt := left(btrim(j.prompt) || case j.style when 'cartoon' then ', cute stylized cartoon style, vibrant colors'
                                                       when 'lowpoly' then ', low poly style, flat shading' else '' end, 600);
      v_body := jsonb_build_object('mode', 'preview', 'prompt', v_prompt,
        'art_style', case when j.style = 'sculpture' then 'sculpture' else 'realistic' end,
        'should_remesh', true, 'topology', 'triangle', 'target_polycount', 30000);
      if s.ai_model is not null then v_body := v_body || jsonb_build_object('ai_model', s.ai_model); end if;
      perform private.ai3d_send(j.id, 'create_preview', v_base, v_body);
    else
      v_body := jsonb_build_object('image_url', j.image_data, 'should_texture', s.textured, 'enable_pbr', s.textured,
        'should_remesh', true, 'topology', 'triangle', 'target_polycount', 30000);
      if s.ai_model is not null then v_body := v_body || jsonb_build_object('ai_model', s.ai_model); end if;
      perform private.ai3d_send(j.id, 'create_image', v_base, v_body);
    end if;
  elsif j.status in ('shaping', 'texturing') then
    if j.updated_at < now() - interval '4 seconds' then
      perform private.ai3d_send(j.id, 'poll', v_base || '/' || coalesce(j.task_final, j.task_preview), null);
    end if;
  elsif j.status = 'saving' then
    if j.updated_at < now() - interval '20 minutes' then
      -- Couldn't copy it: keep the provider's links (they last a few days) and finish.
      update public.ai3d_jobs set status = 'done', progress = 100, keep_token = null, finished_at = now(), updated_at = now() where id = j.id;
    elsif j.updated_at < now() - interval '3 minutes' then
      perform private.ai3d_keep(j.id);
    end if;
  end if;
end $$;
revoke all on function private.ai3d_advance(uuid) from public, anon, authenticated;

create or replace function private.ai3d_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.ai3d_jobs where status not in ('done', 'failed') order by created_at limit 30 loop
    perform private.ai3d_advance(v_id);
  end loop;
end $$;
revoke all on function private.ai3d_tick() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── for ai3d-keep (service role)
create or replace function public.ai3d_keep_claim(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j public.ai3d_jobs;
begin
  update public.ai3d_jobs set keep_token = null
   where id = p_id and keep_token = p_token and status = 'saving'
  returning * into j;
  if not found then return null; end if;
  return jsonb_build_object('glb', j.remote ->> 'glb', 'thumb', j.remote ->> 'thumb');
end $$;
revoke all on function public.ai3d_keep_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.ai3d_keep_claim(uuid, text) to service_role;

create or replace function public.ai3d_keep_done(p_id uuid, p_glb text, p_thumb text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ai3d_jobs
     set status = 'done', progress = 100, finished_at = now(), updated_at = now(),
         glb = case when p_glb ~ ('^' || p_id::text || '/[0-9a-f-]{36}\.glb$') then p_glb end,
         thumb = case when p_thumb ~ ('^' || p_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then p_thumb end,
         error = case when p_error is not null then left('kept_remote: ' || p_error, 300) end
   where id = p_id and status = 'saving';
end $$;
revoke all on function public.ai3d_keep_done(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ai3d_keep_done(uuid, text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────── public (the site)
/** What the page shows: on or not, prices, how to pay, and models customers chose to share. */
create or replace function public.ai3d_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', s.enabled and s.key_secret is not null,
    'packages', s.packages, 'cost_text', s.cost_text, 'cost_image', s.cost_image, 'textured', s.textured,
    'pay_ar', s.pay_ar, 'pay_en', s.pay_en, 'free_credits', s.free_credits,
    'made', (select count(*) from public.ai3d_jobs where status = 'done'),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'kind', j.kind, 'prompt', case when j.kind = 'text' then j.prompt end,
                                                            'style', j.style, 'glb', j.glb, 'thumb', j.thumb) order by j.finished_at desc)
                           from (select * from public.ai3d_jobs where featured and status = 'done' and glb is not null
                                  order by finished_at desc limit 24) j), '[]'::jsonb))
    from private.ai3d_settings s where s.id = 1
$$;
revoke all on function public.ai3d_info() from public;
grant execute on function public.ai3d_info() to anon, authenticated;

create or replace function public.ai3d_wallet_create(p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := private.clean_phone(p_phone);
  v_token text;
  v_code text;
  v_free int;
begin
  if not private.throttle('ai3d_wallet', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if char_length(v_name) not between 2 and 80 or v_phone is null or v_phone !~ '^\+[0-9]{8,15}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select free_credits into v_free from private.ai3d_settings where id = 1;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  loop
    v_code := 'X3D-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.ai3d_wallets where code = v_code);
  end loop;
  insert into public.ai3d_wallets (code, token_hash, name, phone, credits)
  values (v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_name, v_phone, coalesce(v_free, 0));
  return jsonb_build_object('ok', true, 'token', v_token, 'code', v_code, 'credits', coalesce(v_free, 0));
end $$;
revoke all on function public.ai3d_wallet_create(text, text) from public;
grant execute on function public.ai3d_wallet_create(text, text) to anon, authenticated;

/** Back into a wallet on another device: its code and phone; the old key stops working. */
create or replace function public.ai3d_wallet_recover(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  w public.ai3d_wallets;
begin
  if not private.throttle('ai3d_recover', 6, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.ai3d_wallets set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), seen_at = now()
   where code = upper(btrim(coalesce(p_code, ''))) and phone = private.clean_phone(p_phone) and not blocked
  returning * into w;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'code', w.code, 'credits', w.credits);
end $$;
revoke all on function public.ai3d_wallet_recover(text, text) from public;
grant execute on function public.ai3d_wallet_recover(text, text) to anon, authenticated;

/** The wallet, its top-ups and models (and a step forward for the ones still being made). */
create or replace function public.ai3d_me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
  v_id uuid;
begin
  if not private.throttle('ai3d_me', 240, interval '10 minutes') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  for v_id in select id from public.ai3d_jobs where wallet_id = w.id and status not in ('done', 'failed') and updated_at < now() - interval '3 seconds' loop
    perform private.ai3d_advance(v_id);
  end loop;
  select * into w from public.ai3d_wallets where id = w.id;
  return jsonb_build_object(
    'wallet', jsonb_build_object('code', w.code, 'name', w.name, 'phone', w.phone, 'credits', w.credits),
    'topups', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'credits', t.credits, 'amount', t.amount, 'method', t.method,
                                                            'status', t.status, 'note', t.note, 'created_at', t.created_at) order by t.created_at desc)
                          from (select * from public.ai3d_topups where wallet_id = w.id order by created_at desc limit 20) t), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(private.ai3d_job_json(j) order by j.created_at desc)
                        from (select * from public.ai3d_jobs where wallet_id = w.id order by created_at desc limit 60) j), '[]'::jsonb));
end $$;
revoke all on function public.ai3d_me(text) from public;
grant execute on function public.ai3d_me(text) to anon, authenticated;

/** Where to upload a payment receipt (the next hour, once). */
create or replace function public.ai3d_receipt_slot(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
  v_path text := 'r/' || w.id || '/' || gen_random_uuid() || '.jpg';
begin
  if not private.throttle('ai3d_slot', 20, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into private.ai3d_uploads (path, wallet_id) values (v_path, w.id);
  return v_path;
end $$;
revoke all on function public.ai3d_receipt_slot(text) from public;
grant execute on function public.ai3d_receipt_slot(text) to anon, authenticated;

create or replace function public.ai3d_topup(p_token text, p_package int, p_method text, p_sender text, p_receipt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
  s private.ai3d_settings;
  p jsonb;
begin
  select * into s from private.ai3d_settings where id = 1;
  p := s.packages -> p_package;
  if p is null or p_method not in ('vodafone_cash', 'instapay', 'other') or char_length(btrim(coalesce(p_sender, ''))) not between 3 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_receipt is null or not exists (select 1 from private.ai3d_uploads where path = p_receipt and wallet_id = w.id and used_at is null) then
    return jsonb_build_object('ok', false, 'error', 'receipt');
  end if;
  if (select count(*) from public.ai3d_topups where wallet_id = w.id and status = 'pending') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  update private.ai3d_uploads set used_at = now() where path = p_receipt;
  insert into public.ai3d_topups (wallet_id, credits, amount, method, sender, receipt)
  values (w.id, (p ->> 'credits')::int, (p ->> 'price')::numeric, p_method, btrim(p_sender), p_receipt);
  perform private.notify_staff('ai3d', '🧊 شحن 3D AI: ' || (p ->> 'credits') || ' كريدت',
    w.name || ' دفع ' || (p ->> 'price') || ' جنيه — راجع الإيصال', '/app/#/staff/ai3d');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ai3d_topup(text, int, text, text, text) from public;
grant execute on function public.ai3d_topup(text, int, text, text, text) to anon, authenticated;

/** Start a model: takes the credits now (given back if it fails). */
create or replace function public.ai3d_generate(p_token text, p_kind text, p_prompt text, p_style text, p_image text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
  s private.ai3d_settings;
  v_cost int;
  v_id uuid;
begin
  select * into s from private.ai3d_settings where id = 1;
  if not s.enabled or s.key_secret is null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if not private.throttle('ai3d_generate', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_kind not in ('text', 'image') or coalesce(p_style, 'realistic') not in ('realistic', 'cartoon', 'lowpoly', 'sculpture')
     or (p_kind = 'text' and char_length(btrim(coalesce(p_prompt, ''))) not between 3 and 500)
     or (p_kind = 'image' and (p_image is null or p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or char_length(p_image) > 2000000)) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select count(*) from public.ai3d_jobs where wallet_id = w.id and status not in ('done', 'failed')) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  v_cost := case when p_kind = 'text' then s.cost_text else s.cost_image end;
  update public.ai3d_wallets set credits = credits - v_cost where id = w.id and credits >= v_cost;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'credits');
  end if;
  insert into public.ai3d_jobs (wallet_id, kind, prompt, style, image_data, credits)
  values (w.id, p_kind, case when p_kind = 'text' then btrim(p_prompt) else nullif(btrim(coalesce(p_prompt, '')), '') end,
          coalesce(p_style, 'realistic'), case when p_kind = 'image' then p_image end, v_cost)
  returning id into v_id;
  perform private.ai3d_advance(v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.ai3d_generate(text, text, text, text, text) from public;
grant execute on function public.ai3d_generate(text, text, text, text, text) to anon, authenticated;

/** The customer agrees (or not) to show this model in the site's gallery (the team picks which). */
create or replace function public.ai3d_share(p_token text, p_id uuid, p_public boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
begin
  update public.ai3d_jobs set public = coalesce(p_public, false), featured = featured and coalesce(p_public, false)
   where id = p_id and wallet_id = w.id;
  return found;
end $$;
revoke all on function public.ai3d_share(text, uuid, boolean) from public;
grant execute on function public.ai3d_share(text, uuid, boolean) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── the team (app)
create or replace function public.staff_ai3d_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s private.ai3d_settings;
begin
  if not private.can_read('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from private.ai3d_settings where id = 1;
  return jsonb_build_object(
    'settings', jsonb_build_object('enabled', s.enabled, 'key_set', s.key_secret is not null, 'ai_model', s.ai_model,
      'cost_text', s.cost_text, 'cost_image', s.cost_image, 'textured', s.textured, 'packages', s.packages,
      'pay_ar', s.pay_ar, 'pay_en', s.pay_en, 'free_credits', s.free_credits),
    'stats', jsonb_build_object(
      'wallets', (select count(*) from public.ai3d_wallets),
      'done', (select count(*) from public.ai3d_jobs where status = 'done'),
      'failed', (select count(*) from public.ai3d_jobs where status = 'failed'),
      'active', (select count(*) from public.ai3d_jobs where status not in ('done', 'failed')),
      'income', (select coalesce(sum(amount), 0) from public.ai3d_topups where status = 'approved'),
      'pending', (select count(*) from public.ai3d_topups where status = 'pending')),
    'topups', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'wallet', t.wallet_id, 'code', w.code, 'name', w.name, 'phone', w.phone,
                          'credits', t.credits, 'amount', t.amount, 'method', t.method, 'sender', t.sender, 'receipt', t.receipt,
                          'status', t.status, 'note', t.note, 'created_at', t.created_at, 'reviewed_at', t.reviewed_at)
                          order by (t.status = 'pending') desc, t.created_at desc)
                        from (select * from public.ai3d_topups order by (status = 'pending') desc, created_at desc limit 150) t
                        join public.ai3d_wallets w on w.id = t.wallet_id), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(private.ai3d_job_json(j) || jsonb_build_object('wallet', w.code, 'name', coalesce(w.name, st.full_name)) order by j.created_at desc)
                      from (select * from public.ai3d_jobs order by created_at desc limit 150) j
                      left join public.ai3d_wallets w on w.id = j.wallet_id
                      left join public.staff st on st.user_id = j.staff_id), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'phone', w.phone, 'credits', w.credits,
                           'blocked', w.blocked, 'created_at', w.created_at, 'seen_at', w.seen_at,
                           'models', (select count(*) from public.ai3d_jobs j where j.wallet_id = w.id and j.status = 'done')) order by w.seen_at desc)
                         from (select * from public.ai3d_wallets order by seen_at desc limit 300) w), '[]'::jsonb));
end $$;
revoke all on function public.staff_ai3d_overview() from public, anon;
grant execute on function public.staff_ai3d_overview() to authenticated;

create or replace function public.staff_ai3d_settings_save(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'packages') <> 'array' or exists (
       select 1 from jsonb_array_elements(p -> 'packages') x
        where jsonb_typeof(x -> 'credits') <> 'number' or jsonb_typeof(x -> 'price') <> 'number'
           or (x ->> 'credits')::numeric not between 1 and 1000 or (x ->> 'price')::numeric not between 0 and 100000
           or (x ->> 'credits')::numeric <> trunc((x ->> 'credits')::numeric)) then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update private.ai3d_settings set
    enabled = coalesce((p ->> 'enabled')::boolean, enabled),
    ai_model = nullif(btrim(coalesce(p ->> 'ai_model', '')), ''),
    cost_text = coalesce((p ->> 'cost_text')::int, cost_text),
    cost_image = coalesce((p ->> 'cost_image')::int, cost_image),
    textured = coalesce((p ->> 'textured')::boolean, textured),
    packages = p -> 'packages',
    pay_ar = nullif(btrim(coalesce(p ->> 'pay_ar', '')), ''),
    pay_en = nullif(btrim(coalesce(p ->> 'pay_en', '')), ''),
    free_credits = coalesce((p ->> 'free_credits')::int, free_credits),
    updated_at = now(), updated_by = auth.uid()
   where id = 1;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'ai3d_settings', 'ai3d', 'settings', p);
end $$;
revoke all on function public.staff_ai3d_settings_save(jsonb) from public, anon;
grant execute on function public.staff_ai3d_settings_save(jsonb) to authenticated;

/** The Meshy API key (owner or full admin): kept in Vault, never shown again. Empty = remove it. */
create or replace function public.staff_ai3d_key_save(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_secret uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select key_secret into v_secret from private.ai3d_settings where id = 1;
  if v_key = '' then
    if v_secret is not null then perform vault.update_secret(v_secret, 'removed'); end if;
    update private.ai3d_settings set key_secret = null, enabled = false, updated_at = now(), updated_by = auth.uid() where id = 1;
  else
    if v_key !~ '^msy_[A-Za-z0-9_-]{10,200}$' then
      raise exception 'invalid_key' using errcode = '22023';
    end if;
    if v_secret is not null then
      perform vault.update_secret(v_secret, v_key);
    else
      v_secret := vault.create_secret(v_key, 'ai3d_meshy_key', 'Meshy API key (BuildX 3D AI)');
    end if;
    update private.ai3d_settings set key_secret = v_secret, updated_at = now(), updated_by = auth.uid() where id = 1;
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'ai3d_key', 'ai3d', 'key', jsonb_build_object('set', v_key <> ''));
  return v_key <> '';
end $$;
revoke all on function public.staff_ai3d_key_save(text) from public, anon;
grant execute on function public.staff_ai3d_key_save(text) to authenticated;

create or replace function public.staff_ai3d_topup_review(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.ai3d_topups;
  w public.ai3d_wallets;
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.ai3d_topups set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending'
  returning * into t;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;
  if p_approve then
    update public.ai3d_wallets set credits = credits + t.credits where id = t.wallet_id returning * into w;
  else
    select * into w from public.ai3d_wallets where id = t.wallet_id;
  end if;
  return jsonb_build_object('ok', true, 'name', w.name, 'phone', w.phone, 'code', w.code, 'credits', w.credits);
end $$;
revoke all on function public.staff_ai3d_topup_review(uuid, boolean, text) from public, anon;
grant execute on function public.staff_ai3d_topup_review(uuid, boolean, text) to authenticated;

/** Add (or take back) credits by hand: a gift, a refund, a correction. */
create or replace function public.staff_ai3d_grant(p_wallet uuid, p_credits int, p_note text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v int;
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_credits is null or p_credits = 0 or abs(p_credits) > 1000 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update public.ai3d_wallets set credits = greatest(0, credits + p_credits) where id = p_wallet returning credits into v;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), (select email from public.staff where user_id = auth.uid()), 'ai3d_grant', 'ai3d_wallets', p_wallet::text,
          jsonb_build_object('credits', p_credits, 'note', left(p_note, 200)));
  return v;
end $$;
revoke all on function public.staff_ai3d_grant(uuid, int, text) from public, anon;
grant execute on function public.staff_ai3d_grant(uuid, int, text) to authenticated;

create or replace function public.staff_ai3d_block(p_wallet uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.ai3d_wallets set blocked = coalesce(p_blocked, false) where id = p_wallet;
end $$;
revoke all on function public.staff_ai3d_block(uuid, boolean) from public, anon;
grant execute on function public.staff_ai3d_block(uuid, boolean) to authenticated;

/** A model made by the team (to try the service, or for the gallery): no wallet, no credits. */
create or replace function public.staff_ai3d_test(p_kind text, p_prompt text, p_style text, p_image text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select key_secret from private.ai3d_settings where id = 1) is null then
    raise exception 'no_key' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ai3d_jobs where staff_id is not null and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;
  if p_kind not in ('text', 'image') or coalesce(p_style, 'realistic') not in ('realistic', 'cartoon', 'lowpoly', 'sculpture')
     or (p_kind = 'text' and char_length(btrim(coalesce(p_prompt, ''))) not between 3 and 500)
     or (p_kind = 'image' and (p_image is null or p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')) then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into public.ai3d_jobs (staff_id, kind, prompt, style, image_data, public)
  values (auth.uid(), p_kind, nullif(btrim(coalesce(p_prompt, '')), ''), coalesce(p_style, 'realistic'), case when p_kind = 'image' then p_image end, true)
  returning id into v_id;
  perform private.ai3d_advance(v_id);
  return v_id;
end $$;
revoke all on function public.staff_ai3d_test(text, text, text, text) from public, anon;
grant execute on function public.staff_ai3d_test(text, text, text, text) to authenticated;

/** Show a model in the site's gallery: only ones the customer agreed to share (or the team's own). */
create or replace function public.staff_ai3d_feature(p_job uuid, p_featured boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.ai3d_jobs set featured = coalesce(p_featured, false)
   where id = p_job and status = 'done' and glb is not null and (public or staff_id is not null);
  return found;
end $$;
revoke all on function public.staff_ai3d_feature(uuid, boolean) from public, anon;
grant execute on function public.staff_ai3d_feature(uuid, boolean) to authenticated;

/** Step the team's own running models forward while they watch. */
create or replace function public.staff_ai3d_poke() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.can_read('ai3d') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_id in select id from public.ai3d_jobs where status not in ('done', 'failed') and updated_at < now() - interval '3 seconds' limit 10 loop
    perform private.ai3d_advance(v_id);
  end loop;
end $$;
revoke all on function public.staff_ai3d_poke() from public, anon;
grant execute on function public.staff_ai3d_poke() to authenticated;

-- The owner's permission table knows the new area (and email, which it was missing).
do $$
declare
  d text := pg_get_functiondef('public.staff_permission_matrix'::regproc);
begin
  if d not like '%''ai3d''%' then
    execute replace(d, '''sectors'', ''inventory''];', '''sectors'', ''inventory'', ''email'', ''ai3d''];');
  end if;
end $$;

-- Every minute, only while something is being made.
do $$ begin
if not exists (select 1 from cron.job where jobname = 'ai3d-tick') then
  perform cron.schedule('ai3d-tick', '* * * * *', 'select private.ai3d_tick()');
end if;
end $$;
