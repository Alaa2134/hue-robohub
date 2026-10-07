-- BuildX HUE — attack protection, monitoring and site analytics.
--  * Per-IP rate limits and an IP blocklist on everything anonymous visitors can call.
--  * A security event log (honeypot hits, floods, failed logins, lockouts, blocked requests).
--  * security_pulse(): aggregate counts only, polled hourly by the GitHub monitor workflow.
--  * Admin tools: overview, block/unblock an IP, sign a student out everywhere.
--  * Privacy-friendly page-view counts (no cookies, no stored IPs) and browser error reports.
-- Applied in parts (enable_pg_cron, security_monitoring_core, …); nothing here deletes rows — the
-- retention job is in 20261007110000_retention.sql.

create extension if not exists pg_cron with schema pg_catalog;

-- ─────────────────────────────────────────────────────────────── request context
/** Client IP as seen by the API gateway (Cloudflare's header first), or null outside an API request. */
create or replace function private.client_ip() returns text
language sql stable set search_path = ''
as $$
  select nullif(left(btrim(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    '')), 64), '')
$$;

create or replace function private.request_header(p_name text) returns text
language sql stable set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> p_name
$$;

-- ─────────────────────────────────────────────────────────────── tables (not exposed over the API)
create table private.security_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  severity smallint not null default 1 check (severity between 1 and 3),
  ip text,
  detail jsonb not null default '{}'
);
create index security_events_at_idx on private.security_events (at desc);
create index security_events_ip_idx on private.security_events (ip, at desc);

-- First version of the limiter (superseded by rate_counters below; kept empty).
create table private.rate_hits (
  bucket text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index rate_hits_lookup_idx on private.rate_hits (bucket, ip, at desc);

create table private.blocked_ips (
  ip text primary key,
  reason text not null default '',
  until timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table private.page_views (
  id bigserial primary key,
  at timestamptz not null default now(),
  day date not null default (now() at time zone 'Africa/Cairo')::date,
  path text not null,
  locale text not null default 'en',
  referrer text,
  device text not null default 'desktop',
  country text,
  visitor bytea not null
);
create index page_views_day_idx on private.page_views (day desc);

-- One random salt per day, deleted after two days: visitor hashes can't be linked across days or reversed.
create table private.analytics_salt (
  day date primary key,
  salt bytea not null default extensions.gen_random_bytes(16)
);

create table private.client_errors (
  id bigserial primary key,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  fingerprint text not null unique,
  message text not null,
  source text,
  path text,
  browser text,
  count int not null default 1,
  resolved_at timestamptz
);
create index client_errors_last_idx on private.client_errors (last_at desc);

-- ─────────────────────────────────────────────────────────────── helpers
create or replace function private.log_security(p_kind text, p_severity int, p_detail jsonb default '{}') returns void
language sql security definer set search_path = ''
as $$
  insert into private.security_events (kind, severity, ip, detail) values (p_kind, p_severity, private.client_ip(), coalesce(p_detail, '{}'))
$$;

-- One row per (bucket, IP, time window) instead of one per request.
create table private.rate_counters (
  bucket text not null,
  ip text not null,
  window_start timestamptz not null,
  n int not null default 0,
  primary key (bucket, ip, window_start)
);

/**
 * True when this IP may go ahead: not blocked and under `p_max` calls to `p_bucket` in the current
 * `p_window`. The first refused call of a window is logged. Calls outside an API request (no IP) pass.
 */
create or replace function private.throttle(p_bucket text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ip text := private.client_ip();
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2026-01-01 00:00:00+00');
  v_n int;
begin
  if v_ip is null then
    return true;
  end if;
  if exists (select 1 from private.blocked_ips where ip = v_ip and (until is null or until > now())) then
    if not exists (select 1 from private.security_events where ip = v_ip and kind = 'blocked_ip' and at > now() - interval '10 minutes') then
      perform private.log_security('blocked_ip', 2, jsonb_build_object('bucket', p_bucket));
    end if;
    return false;
  end if;
  insert into private.rate_counters as c (bucket, ip, window_start, n) values (p_bucket, v_ip, v_start, 1)
  on conflict (bucket, ip, window_start) do update set n = c.n + 1
  returning n into v_n;
  if v_n > p_max then
    if v_n = p_max + 1 then
      perform private.log_security('rate_limited', 2, jsonb_build_object('bucket', p_bucket, 'limit', p_max, 'window', p_window::text));
    end if;
    return false;
  end if;
  return true;
end $$;

revoke execute on function private.client_ip(), private.request_header(text), private.log_security(text, int, jsonb), private.throttle(text, int, interval) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── application form
create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_ref text;
  v_recent int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Five applications an hour from one network is plenty for a computer lab. Outside the exception
  -- block below, so rejected (invalid) submissions still count.
  if not private.throttle('apply', 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce((select (value ->> 'open')::boolean from public.site_settings where key = 'applications'), true) is false then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  -- Honeypot field: bots fill it, people never see it.
  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'apply'));
    return jsonb_build_object('ok', true, 'ref', 'BX-000000');
  end if;
  if v_phone ~ '^01[0-9]{9}$' then
    v_phone := '+2' || v_phone;
  elsif v_phone ~ '^00[0-9]+$' then
    v_phone := '+' || substr(v_phone, 3);
  end if;

  -- Flood guard for the whole form.
  select count(*) into v_recent from public.applications where created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    perform private.log_security('apply_flood', 3, jsonb_build_object('last_minute', v_recent));
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  select ref into v_ref from public.applications
   where (phone = v_phone or lower(email) = v_email) and created_at > now() - interval '7 days'
   order by created_at desc limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true);
  end if;

  for i in 1..5 loop
    v_ref := 'BX-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.applications where ref = v_ref);
  end loop;

  begin
  insert into public.applications (
    ref, locale, full_name, phone, email, faculty, academic_year, student_number,
    track_first, track_second, team_roles, experience_level, skills, experience, portfolio_url,
    motivation, goals, hours_per_week, days, heard_from, consent
  ) values (
    v_ref,
    case when p ->> 'locale' = 'en' then 'en' else 'ar' end,
    btrim(p ->> 'full_name'),
    v_phone,
    v_email,
    btrim(p ->> 'faculty'),
    btrim(p ->> 'academic_year'),
    nullif(btrim(p ->> 'student_number'), ''),
    btrim(p ->> 'track_first'),
    nullif(btrim(p ->> 'track_second'), ''),
    coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'team_roles', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    p ->> 'experience_level',
    nullif(btrim(p ->> 'skills'), ''),
    nullif(btrim(p ->> 'experience'), ''),
    nullif(btrim(p ->> 'portfolio_url'), ''),
    btrim(p ->> 'motivation'),
    nullif(btrim(p ->> 'goals'), ''),
    p ->> 'hours_per_week',
    coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'days', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    nullif(btrim(p ->> 'heard_from'), ''),
    coalesce((p ->> 'consent')::boolean, false)
  );
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_parameter_value or string_data_right_truncation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true, 'ref', v_ref);
end $$;

-- ─────────────────────────────────────────────────────────────── student sign-in
create or replace function public.student_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := private.code_key(p_code);
  v_st public.students%rowtype;
  v_sec private.student_secrets%rowtype;
  v_fails int;
  v_token text;
begin
  -- Per-network limit on top of the per-account lockout: stops PIN guessing spread over many codes.
  if not private.throttle('login', 30, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_key is null or p_pin is null or p_pin !~ '^[0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_st from public.students where code_key = v_key and active;
  if not found then
    perform private.log_security('login_failed', 1, jsonb_build_object('reason', 'unknown_code'));
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_sec from private.student_secrets where student_id = v_st.id for update;
  if not found or v_sec.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;
  if v_sec.locked_until is not null and v_sec.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'until', v_sec.locked_until);
  end if;
  if extensions.crypt(p_pin, v_sec.pin_hash) <> v_sec.pin_hash then
    v_fails := v_sec.failed_attempts + 1;
    update private.student_secrets
       set failed_attempts = v_fails,
           locked_until = case when v_fails % 5 = 0
             then now() + make_interval(mins => 15 * (2 ^ least(v_fails / 5 - 1, 6))::int)
             else locked_until end
     where student_id = v_st.id;
    perform private.log_security(case when v_fails % 5 = 0 then 'account_locked' else 'login_failed' end, case when v_fails % 5 = 0 then 2 else 1 end,
      jsonb_build_object('code', v_st.code, 'attempts', v_fails));
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update private.student_secrets set failed_attempts = 0, locked_until = null, last_login_at = now() where student_id = v_st.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.student_sessions (token_hash, student_id, expires_at)
  values (extensions.digest(v_token, 'sha256'), v_st.id, now() + interval '120 days');
  update private.student_sessions set revoked_at = now()
   where student_id = v_st.id and revoked_at is null
     and token_hash not in (select token_hash from private.student_sessions
                             where student_id = v_st.id and revoked_at is null order by created_at desc limit 5);
  return jsonb_build_object('ok', true, 'token', v_token,
    'student', jsonb_build_object('name', v_st.full_name, 'code', v_st.code, 'group', v_st.group_name));
end $$;

create or replace function public.student_change_pin(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
  v_hash text;
begin
  if not private.throttle('pin_change', 10, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_new is null or p_new !~ '^[0-9]{6}$' or p_new ~ '^(\d)\1{5}$'
     or p_new in ('123456', '654321', '012345', '543210', '987654', '456789', '123123') then
    return jsonb_build_object('ok', false, 'error', 'weak');
  end if;
  select pin_hash into v_hash from private.student_secrets where student_id = v_id for update;
  if v_hash is null or p_old is null or extensions.crypt(p_old, v_hash) <> v_hash then
    perform private.log_security('pin_change_failed', 1, '{}');
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update private.student_secrets
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8)), pin_changed_at = now(), failed_attempts = 0
   where student_id = v_id;
  update private.student_sessions set revoked_at = now()
   where student_id = v_id and revoked_at is null and token_hash <> extensions.digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────── monitoring
/** Aggregate counts for the last hour and an overall level. No IPs or names: safe to call anonymously. */
create or replace function public.security_pulse() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c jsonb;
  n_rate int; n_honey int; n_fail int; n_lock int; n_flood int; n_block int;
  v_level text := 'ok';
begin
  select coalesce(jsonb_object_agg(kind, n), '{}') into c
    from (select kind, count(*) n from private.security_events where at > now() - interval '1 hour' group by kind) x;
  n_rate := coalesce((c ->> 'rate_limited')::int, 0);
  n_honey := coalesce((c ->> 'honeypot')::int, 0);
  n_fail := coalesce((c ->> 'login_failed')::int, 0);
  n_lock := coalesce((c ->> 'account_locked')::int, 0);
  n_flood := coalesce((c ->> 'apply_flood')::int, 0);
  n_block := coalesce((c ->> 'blocked_ip')::int, 0);
  if n_flood > 0 or n_rate >= 20 or n_fail >= 100 or n_lock >= 10 then
    v_level := 'attack';
  elsif n_rate > 0 or n_honey >= 5 or n_lock > 0 or n_fail >= 25 or n_block > 0 then
    v_level := 'elevated';
  end if;
  return jsonb_build_object('level', v_level, 'last_hour', c, 'at', now());
end $$;

create or replace function public.staff_security_overview(p_hours int default 24) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 90));
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pulse', public.security_pulse(),
    'counts', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from private.security_events where at > v_since group by kind) x), '{}'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', at, 'kind', kind, 'severity', severity, 'ip', ip, 'detail', detail) order by at desc)
                          from (select * from private.security_events where at > v_since order by at desc limit 300) e), '[]'),
    'top_ips', coalesce((select jsonb_agg(jsonb_build_object('ip', ip, 'events', n, 'worst', worst, 'kinds', kinds, 'last', last) order by worst desc, n desc)
                          from (select ip, count(*) n, max(severity) worst, array_agg(distinct kind) kinds, max(at) last
                                  from private.security_events where at > v_since and ip is not null group by ip order by max(severity) desc, count(*) desc limit 20) t), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('ip', ip, 'reason', reason, 'until', until, 'created_at', created_at) order by created_at desc)
                           from private.blocked_ips where until is null or until > now()), '[]'),
    'locked_students', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name, 'code', s.code, 'until', x.locked_until))
                                   from private.student_secrets x join public.students s on s.id = x.student_id where x.locked_until > now()), '[]')
  );
end $$;

create or replace function public.staff_block_ip(p_ip text, p_hours int default 24, p_reason text default '') returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ip text := host(btrim(p_ip)::inet);
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into private.blocked_ips (ip, reason, until, created_by)
  values (v_ip, left(coalesce(p_reason, ''), 200), case when coalesce(p_hours, 0) > 0 then now() + make_interval(hours => p_hours) end, auth.uid())
  on conflict (ip) do update set reason = excluded.reason, until = excluded.until, created_by = excluded.created_by, created_at = now();
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'block_ip', 'security', v_ip, jsonb_build_object('hours', p_hours, 'reason', p_reason));
end $$;

create or replace function public.staff_unblock_ip(p_ip text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.blocked_ips set until = now() where ip = btrim(p_ip);
  insert into public.audit_log (actor, actor_email, action, entity, entity_id)
  values (auth.uid(), auth.jwt() ->> 'email', 'unblock_ip', 'security', btrim(p_ip));
end $$;

/** Sign a student out on every device (lost phone, shared PIN) and clear any lockout. */
create or replace function public.staff_sign_out_student(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.student_sessions set revoked_at = now() where student_id = p_id and revoked_at is null;
  get diagnostics v_n = row_count;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, detail)
  values (auth.uid(), auth.jwt() ->> 'email', 'sign_out', 'students', p_id::text, jsonb_build_object('sessions', v_n));
  return v_n;
end $$;

/** Lift a student's PIN lockout early (staff confirmed it was them). */
create or replace function public.staff_unlock_student(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.student_secrets set locked_until = null, failed_attempts = 0 where student_id = p_id;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id)
  values (auth.uid(), auth.jwt() ->> 'email', 'unlock', 'students', p_id::text);
end $$;

-- ─────────────────────────────────────────────────────────────── analytics
/** Count one page view. No cookies; the visitor hash uses a salt that is deleted after two days. */
create or replace function public.track_view(p_path text, p_referrer text default null, p_locale text default 'en') returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ua text := coalesce(private.request_header('user-agent'), '');
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_salt bytea;
  v_ref text;
begin
  if v_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp)' then
    return;
  end if;
  if p_path is null or p_path !~ '^/[A-Za-z0-9/_\-\.]{0,200}$' then
    return;
  end if;
  if not private.throttle('view', 120, interval '10 minutes') then
    return;
  end if;
  insert into private.analytics_salt (day) values (v_day) on conflict (day) do nothing;
  select salt into v_salt from private.analytics_salt where day = v_day;
  v_ref := substring(lower(coalesce(p_referrer, '')) from '^https?://(?:www\.)?([a-z0-9.\-]{1,100})');
  insert into private.page_views (day, path, locale, referrer, device, country, visitor)
  values (
    v_day,
    left(p_path, 200),
    case when p_locale = 'ar' then 'ar' else 'en' end,
    nullif(v_ref, ''),
    case when v_ua ~* '(ipad|tablet)' then 'tablet' when v_ua ~* '(mobi|android|iphone)' then 'mobile' else 'desktop' end,
    nullif(upper(left(coalesce(private.request_header('cf-ipcountry'), ''), 2)), ''),
    extensions.digest(convert_to(coalesce(private.client_ip(), '') || '|' || v_ua, 'UTF8') || v_salt, 'sha256')
  );
end $$;

/** Record a browser error once per fingerprint (repeats only bump the count). */
create or replace function public.log_client_error(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg text := left(btrim(coalesce(p ->> 'message', '')), 500);
  v_src text := left(coalesce(p ->> 'source', ''), 300);
  v_fp text;
begin
  if v_msg = '' or jsonb_typeof(p) is distinct from 'object' then
    return;
  end if;
  if not private.throttle('client_error', 20, interval '10 minutes') then
    return;
  end if;
  v_fp := encode(extensions.digest(v_msg || '|' || v_src, 'sha256'), 'hex');
  insert into private.client_errors (fingerprint, message, source, path, browser)
  values (v_fp, v_msg, nullif(v_src, ''), left(p ->> 'path', 200), left(coalesce(private.request_header('user-agent'), ''), 200))
  on conflict (fingerprint) do update
    set count = private.client_errors.count + 1, last_at = now(), path = excluded.path, browser = excluded.browser, resolved_at = null;
end $$;

create or replace function public.staff_site_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from date := (now() at time zone 'Africa/Cairo')::date - least(greatest(coalesce(p_days, 30), 1), 365) + 1;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'from', v_from,
    'totals', (select jsonb_build_object('views', count(*), 'visitors', count(distinct (day, visitor))) from private.page_views where day >= v_from),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'views', v, 'visitors', u) order by d)
                         from (select day d, count(*) v, count(distinct visitor) u from private.page_views where day >= v_from group by day) x), '[]'),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc)
                         from (select path, count(*) n from private.page_views where day >= v_from group by path order by count(*) desc limit 15) x), '[]'),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('host', referrer, 'views', n) order by n desc)
                             from (select referrer, count(*) n from private.page_views where day >= v_from and referrer is not null group by referrer order by count(*) desc limit 10) x), '[]'),
    'countries', coalesce((select jsonb_object_agg(coalesce(country, '??'), n) from (select country, count(*) n from private.page_views where day >= v_from group by country) x), '{}'),
    'devices', coalesce((select jsonb_object_agg(device, n) from (select device, count(*) n from private.page_views where day >= v_from group by device) x), '{}'),
    'locales', coalesce((select jsonb_object_agg(locale, n) from (select locale, count(*) n from private.page_views where day >= v_from group by locale) x), '{}')
  );
end $$;

create or replace function public.staff_client_errors(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'source', source, 'path', path, 'browser', browser, 'count', count, 'first_at', first_at, 'last_at', last_at) order by last_at desc)
                     from (select * from private.client_errors where resolved_at is null and last_at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90)) order by last_at desc limit 100) e), '[]');
end $$;

/** Mark an error as fixed; it comes back if it happens again. */
create or replace function public.staff_resolve_client_error(p_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.client_errors set resolved_at = now() where id = p_id;
end $$;

-- ─────────────────────────────────────────────────────────────── grants
revoke execute on function public.security_pulse(), public.staff_security_overview(int), public.staff_block_ip(text, int, text), public.staff_unblock_ip(text),
  public.staff_sign_out_student(uuid), public.staff_unlock_student(uuid), public.track_view(text, text, text), public.log_client_error(jsonb),
  public.staff_site_stats(int), public.staff_client_errors(int), public.staff_resolve_client_error(bigint) from public, anon;
grant execute on function public.security_pulse(), public.track_view(text, text, text), public.log_client_error(jsonb) to anon, authenticated;
grant execute on function public.staff_security_overview(int), public.staff_block_ip(text, int, text), public.staff_unblock_ip(text),
  public.staff_sign_out_student(uuid), public.staff_unlock_student(uuid), public.staff_site_stats(int), public.staff_client_errors(int),
  public.staff_resolve_client_error(bigint) to authenticated;
