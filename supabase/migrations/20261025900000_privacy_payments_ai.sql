-- Review fixes:
--  · privacy: the join form stops asking for the national ID, governorate and full address; only
--    someone accepted gives them (from the status page), for the Student Welfare family list.
--  · security: the public site can read only the team-profile columns it shows.
--  · payments: a ledger of every 3D AI wallet movement (top-up, charge, refund, grant), and a log of
--    every trip / form fee marked paid or unpaid — two separate records.
--  · AI: a daily token budget per person (not just per call), usage per person kept as a hash (no
--    address or name), and service errors logged as status + kind only.

-- ─── Security: what the public reads from team profiles ──────────────────
revoke select on public.team_profiles from anon;
grant select (id, slug, full_name, full_name_ar, headline, headline_ar, bio, bio_ar, group_kind, track, photo_path,
              skills, links, external_url, published, sort_order, created_at, updated_at) on public.team_profiles to anon;

-- ─── Privacy: the join form ──────────────────────────────────────────────
update public.site_settings
   set value = jsonb_set(coalesce(value, '{}'), '{fields}',
         coalesce(value -> 'fields', '{}')
         || jsonb_build_object('national_id', coalesce(value #> '{fields,national_id}', '{}') || '{"hidden": true, "required": false}',
                               'governorate', coalesce(value #> '{fields,governorate}', '{}') || '{"hidden": true, "required": false}',
                               'address', coalesce(value #> '{fields,address}', '{}') || '{"hidden": true, "required": false}')),
       updated_at = now()
 where key = 'apply_form';

/** Put an accepted applicant on this year's family list (no permission check: callers check). */
create or replace function private.family_from_application_core(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.applications%rowtype;
  v_settings jsonb := coalesce((select value from public.site_settings where key = 'family'), '{}'::jsonb);
  v_year text := coalesce(nullif(v_settings ->> 'year', ''), private.current_academic_year());
  v_phone text;
  v_level int;
  v_faculty text;
  v_ref text;
begin
  select * into a from public.applications where id = p_id;
  if not found or a.national_id is null or a.governorate is null or a.address is null then
    return;
  end if;
  v_phone := regexp_replace(a.phone, '[^0-9]', '', 'g');
  if v_phone ~ '^(20|0020)1[0125][0-9]{8}$' then
    v_phone := '0' || right(v_phone, 10);
  end if;
  v_level := case when a.academic_year ~ '^[1-5]$' then a.academic_year::int end;
  v_faculty := coalesce(nullif(btrim(a.faculty), ''), nullif(btrim(v_settings ->> 'faculty'), ''));
  if v_phone !~ '^01[0125][0-9]{8}$' or v_level is null or v_faculty is null then
    return;
  end if;
  if exists (select 1 from public.family_members where academic_year = v_year and national_id = a.national_id) then
    update public.family_members set student_id = coalesce(student_id, a.student_id)
     where academic_year = v_year and national_id = a.national_id;
    return;
  end if;
  for i in 1..5 loop
    v_ref := 'FM-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.family_members where ref = v_ref);
  end loop;
  insert into public.family_members (ref, academic_year, full_name, national_id, phone, governorate, address, level,
                                     faculty, student_number, email, status, notes, student_id, locale)
  values (v_ref, v_year, left(a.full_name, 120), a.national_id, v_phone, a.governorate, a.address, v_level,
          left(v_faculty, 120), left(a.student_number, 40), nullif(left(a.email, 200), ''), 'accepted',
          'من طلب الانضمام ' || a.ref, a.student_id, a.locale);
exception when others then
  -- The family list is a help; accepting never fails because of it.
  return;
end $$;
revoke all on function private.family_from_application_core(uuid) from public, anon, authenticated;

create or replace function private.family_from_application(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.can('applications') or private.is_admin() then
    perform private.family_from_application_core(p_id);
  end if;
end $$;

-- The status page asks an accepted applicant for what the family list needs.
create or replace function public.application_status(p_ref text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(private.code_key(p_ref), '');
  v_ref text;
  v_phone text := private.clean_phone(p_phone);
  v_app public.applications%rowtype;
begin
  if not private.throttle('app_status', 10, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_ref := case when v_key ~ '^BX[0-9A-F]{6}$' then 'BX-' || substr(v_key, 3)
                when v_key ~ '^[0-9A-F]{6}$' then 'BX-' || v_key end;
  if v_ref is null or coalesce(v_phone, '') !~ '^\+?[0-9]{8,15}$' then
    return jsonb_build_object('ok', false, 'error', case when v_key ~ '^F?[0-9A-F]{8}$' then 'form_code' else 'not_found' end);
  end if;

  select * into v_app from public.applications where ref = v_ref and private.clean_phone(phone) = v_phone;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'ok', true,
    'ref', v_app.ref,
    'first_name', split_part(btrim(v_app.full_name), ' ', 1),
    'track', v_app.track_first,
    'status', v_app.status,
    'created_at', v_app.created_at,
    'updated_at', coalesce(v_app.reviewed_at, v_app.created_at),
    'note', v_app.public_note,
    'family_needed', v_app.status = 'accepted' and (v_app.national_id is null or v_app.governorate is null or v_app.address is null)
  );
end $$;

/** After acceptance: the applicant gives their national ID, governorate and address once, for the family list. */
create or replace function public.application_family_complete(p_ref text, p_phone text, p_national_id text, p_governorate text, p_address text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(private.code_key(p_ref), '');
  v_ref text := case when v_key ~ '^BX[0-9A-F]{6}$' then 'BX-' || substr(v_key, 3) when v_key ~ '^[0-9A-F]{6}$' then 'BX-' || v_key end;
  v_phone text := private.clean_phone(p_phone);
  v_nid text := nullif(regexp_replace(translate(coalesce(p_national_id, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '');
  v_gov text := nullif(btrim(p_governorate), '');
  v_addr text := nullif(btrim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')), '');
  v_app public.applications%rowtype;
begin
  if not private.throttle('app_family', 6, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into v_app from public.applications where ref = v_ref and private.clean_phone(phone) = v_phone;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_app.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'not_accepted');
  end if;
  if v_app.national_id is not null and v_app.governorate is not null and v_app.address is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_nid is null or not private.national_id_ok(v_nid) then
    return jsonb_build_object('ok', false, 'error', 'nid');
  end if;
  if v_gov is null or char_length(v_gov) not between 2 and 40 then
    return jsonb_build_object('ok', false, 'error', 'governorate');
  end if;
  if v_addr is null or char_length(v_addr) not between 5 and 200 then
    return jsonb_build_object('ok', false, 'error', 'address');
  end if;
  update public.applications set national_id = v_nid, governorate = v_gov, address = v_addr where id = v_app.id;
  perform private.family_from_application_core(v_app.id);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.application_family_complete(text, text, text, text, text) from public;
grant execute on function public.application_family_complete(text, text, text, text, text) to anon, authenticated;

-- ─── Payments: the 3D AI wallet ledger ───────────────────────────────────
create table if not exists public.ai3d_ledger (
  id bigint generated always as identity primary key,
  wallet_id uuid references public.ai3d_wallets (id) on delete set null,
  kind text not null check (kind in ('free', 'topup', 'charge', 'refund', 'grant', 'adjust')),
  credits int not null,
  balance int,
  job_id uuid,
  topup_id uuid,
  amount numeric(10, 2),
  note text check (char_length(note) <= 200),
  by uuid,
  at timestamptz not null default now()
);
create index if not exists ai3d_ledger_wallet_idx on public.ai3d_ledger (wallet_id, at desc);
alter table public.ai3d_ledger enable row level security;
create policy ai3d_ledger_read on public.ai3d_ledger for select to authenticated using ((select private.can_read('ai3d')));

/** Every change of a wallet's credits is written down, with what caused it (set by the function that changed it). */
create or replace function private.ai3d_ledger_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d int := new.credits - case when tg_op = 'INSERT' then 0 else old.credits end;
  ctx jsonb := nullif(current_setting('bx.ai3d', true), '')::jsonb;
begin
  if d = 0 then return new; end if;
  insert into public.ai3d_ledger (wallet_id, kind, credits, balance, job_id, topup_id, amount, note, by)
  values (new.id,
          coalesce(ctx ->> 'kind', case when tg_op = 'INSERT' then 'free' else 'adjust' end),
          d, new.credits,
          nullif(ctx ->> 'job', '')::uuid, nullif(ctx ->> 'topup', '')::uuid, nullif(ctx ->> 'amount', '')::numeric,
          left(nullif(ctx ->> 'note', ''), 200), auth.uid());
  perform set_config('bx.ai3d', '', true);
  return new;
end $$;
create or replace trigger ai3d_wallets_ledger after insert or update of credits on public.ai3d_wallets
  for each row execute function private.ai3d_ledger_write();

select private.patch_function('public.ai3d_generate(text,text,text,text,text)',
  $p$  update public.ai3d_wallets set credits = credits - v_cost where id = w.id and credits >= v_cost;$p$,
  $p$  v_id := gen_random_uuid();
  perform set_config('bx.ai3d', jsonb_build_object('kind', 'charge', 'job', v_id)::text, true);
  update public.ai3d_wallets set credits = credits - v_cost where id = w.id and credits >= v_cost;$p$);
select private.patch_function('public.ai3d_generate(text,text,text,text,text)',
  $p$insert into public.ai3d_jobs (wallet_id, kind, prompt, style, image_data, credits)
  values (w.id, $p$,
  $p$insert into public.ai3d_jobs (id, wallet_id, kind, prompt, style, image_data, credits)
  values (v_id, w.id, $p$);
select private.patch_function('private.ai3d_fail(uuid,text)',
  $p$    update public.ai3d_wallets set credits = credits + j.credits where id = j.wallet_id;$p$,
  $p$    perform set_config('bx.ai3d', jsonb_build_object('kind', 'refund', 'job', p_id)::text, true);
    update public.ai3d_wallets set credits = credits + j.credits where id = j.wallet_id;$p$);
select private.patch_function('public.staff_ai3d_topup_review(uuid,boolean,text)',
  $p$    update public.ai3d_wallets set credits = credits + t.credits where id = t.wallet_id returning * into w;$p$,
  $p$    perform set_config('bx.ai3d', jsonb_build_object('kind', 'topup', 'topup', t.id, 'amount', t.amount)::text, true);
    update public.ai3d_wallets set credits = credits + t.credits where id = t.wallet_id returning * into w;$p$);
select private.patch_function('public.staff_ai3d_grant(uuid,integer,text)',
  $p$  update public.ai3d_wallets set credits = greatest(0, credits + p_credits) where id = p_wallet returning credits into v;$p$,
  $p$  perform set_config('bx.ai3d', jsonb_build_object('kind', 'grant', 'note', left(p_note, 200))::text, true);
  update public.ai3d_wallets set credits = greatest(0, credits + p_credits) where id = p_wallet returning credits into v;$p$);

-- What happened before the ledger existed, from the top-ups and jobs, and an opening line per wallet
-- so each wallet's lines add up to its balance today.
insert into public.ai3d_ledger (wallet_id, kind, credits, topup_id, amount, note, by, at)
select t.wallet_id, 'topup', t.credits, t.id, t.amount, 'قبل بدء السجل', t.reviewed_by, coalesce(t.reviewed_at, t.created_at)
  from public.ai3d_topups t
 where t.status = 'approved' and not exists (select 1 from public.ai3d_ledger l where l.topup_id = t.id);
insert into public.ai3d_ledger (wallet_id, kind, credits, job_id, note, at)
select j.wallet_id, 'charge', -j.credits, j.id, 'قبل بدء السجل', j.created_at
  from public.ai3d_jobs j
 where j.wallet_id is not null and j.credits > 0 and not exists (select 1 from public.ai3d_ledger l where l.job_id = j.id and l.kind = 'charge');
insert into public.ai3d_ledger (wallet_id, kind, credits, job_id, note, at)
select j.wallet_id, 'refund', j.credits, j.id, 'قبل بدء السجل', coalesce(j.finished_at, j.updated_at)
  from public.ai3d_jobs j
 where j.wallet_id is not null and j.credits > 0 and j.refunded and not exists (select 1 from public.ai3d_ledger l where l.job_id = j.id and l.kind = 'refund');
insert into public.ai3d_ledger (wallet_id, kind, credits, balance, note, at)
select w.id, 'adjust', w.credits - coalesce(s.total, 0), null, 'رصيد البداية: مجاني أو تعديلات قبل السجل', w.created_at
  from public.ai3d_wallets w
  left join (select wallet_id, sum(credits) total from public.ai3d_ledger group by 1) s on s.wallet_id = w.id
 where w.credits - coalesce(s.total, 0) <> 0
   and not exists (select 1 from public.ai3d_ledger l where l.wallet_id = w.id and l.note like 'رصيد البداية%');

/** A wallet's own history, for the studio. */
create or replace function public.ai3d_history(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  w public.ai3d_wallets := private.ai3d_wallet(p_token);
begin
  if w.id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'credits', l.credits, 'balance', l.balance, 'amount', l.amount, 'at', l.at) order by l.at desc, l.id desc)
                     from (select * from public.ai3d_ledger where wallet_id = w.id order by at desc, id desc limit 100) l), '[]'::jsonb);
end $$;
revoke all on function public.ai3d_history(text) from public;
grant execute on function public.ai3d_history(text) to anon, authenticated;

-- ─── Payments: the trip / form fee log ───────────────────────────────────
create table if not exists public.form_payment_log (
  id bigint generated always as identity primary key,
  response_id uuid references public.form_responses (id) on delete set null,
  form_id uuid references public.forms (id) on delete set null,
  action text not null check (action in ('paid', 'unpaid', 'changed')),
  amount numeric(10, 2),
  method text,
  by uuid,
  note text check (char_length(note) <= 200),
  at timestamptz not null default now()
);
create index if not exists form_payment_log_form_idx on public.form_payment_log (form_id, at desc);
create index if not exists form_payment_log_response_idx on public.form_payment_log (response_id, at desc);
alter table public.form_payment_log enable row level security;
create policy form_payment_log_read on public.form_payment_log for select to authenticated using ((select private.can_read('forms')));

create or replace function private.form_payment_log_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.paid_at is null then return new; end if;
    v_action := 'paid';
  elsif old.paid_at is null and new.paid_at is not null then
    v_action := 'paid';
  elsif old.paid_at is not null and new.paid_at is null then
    v_action := 'unpaid';
  elsif new.paid_at is not null and (old.paid_amount is distinct from new.paid_amount or old.paid_method is distinct from new.paid_method) then
    v_action := 'changed';
  else
    return new;
  end if;
  insert into public.form_payment_log (response_id, form_id, action, amount, method, by)
  values (new.id, new.form_id, v_action,
          case when v_action = 'unpaid' then old.paid_amount else new.paid_amount end,
          case when v_action = 'unpaid' then old.paid_method else new.paid_method end,
          coalesce(auth.uid(), new.paid_by));
  return new;
end $$;
create or replace trigger form_responses_payment_log after insert or update of paid_at, paid_amount, paid_method on public.form_responses
  for each row execute function private.form_payment_log_write();

insert into public.form_payment_log (response_id, form_id, action, amount, method, by, note, at)
select r.id, r.form_id, 'paid', r.paid_amount, r.paid_method, r.paid_by, 'قبل بدء السجل', r.paid_at
  from public.form_responses r
 where r.paid_at is not null and not exists (select 1 from public.form_payment_log l where l.response_id = r.id);

-- ─── AI: budget per person, usage by person (hashed), errors ─────────────
create table if not exists private.ai_salt (id int primary key default 1 check (id = 1), salt text not null);
insert into private.ai_salt (salt) values (encode(extensions.gen_random_bytes(24), 'hex')) on conflict do nothing;

/** Who used the AI, as a hash nobody can turn back into an address or account. */
create or replace function private.ai_who(p text)
returns text language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.digest((select salt from private.ai_salt where id = 1) || coalesce(p, ''), 'sha256'), 'hex'), 16)
$$;
revoke all on function private.ai_who(text) from public, anon, authenticated;

create table if not exists private.ai_usage_by (
  day date not null default (now() at time zone 'Africa/Cairo')::date,
  who text not null,
  service text not null,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, who, service)
);

create table if not exists private.ai_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  service text not null check (char_length(service) <= 30),
  status int,
  kind text check (char_length(kind) <= 60)
);
create index if not exists ai_errors_at_idx on private.ai_errors (at desc);

/** Tokens a person used today on one service. */
create or replace function private.ai_used_today(p_who text, p_service text)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select input_tokens + output_tokens from private.ai_usage_by
                    where day = (now() at time zone 'Africa/Cairo')::date and who = p_who and service = p_service), 0)
$$;
revoke all on function private.ai_used_today(text, text) from public, anon, authenticated;

/** The daily token budget per person ('guide_ai' → per_user_tokens). */
create or replace function private.ai_budget()
returns bigint language sql stable security definer set search_path = '' as $$
  select least(greatest(coalesce((select (value ->> 'per_user_tokens')::bigint from public.site_settings where key = 'guide_ai'), 40000), 1000), 2000000)
$$;
revoke all on function private.ai_budget() from public, anon, authenticated;

-- Usage with who and which service.
create or replace function public.guide_usage_add(p_in bigint, p_out bigint, p_cache_read bigint, p_cache_write bigint, p_service text, p_who text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.guide_usage_add(p_in, p_out, p_cache_read, p_cache_write);
  if nullif(p_who, '') is not null then
    insert into private.ai_usage_by as u (who, service, calls, input_tokens, output_tokens)
    values (left(p_who, 16), left(coalesce(p_service, 'guide'), 20), 1, coalesce(p_in, 0) + coalesce(p_cache_write, 0), coalesce(p_out, 0))
    on conflict (day, who, service) do update set
      calls = u.calls + 1, input_tokens = u.input_tokens + excluded.input_tokens, output_tokens = u.output_tokens + excluded.output_tokens;
  end if;
end $$;
revoke all on function public.guide_usage_add(bigint, bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.guide_usage_add(bigint, bigint, bigint, bigint, text, text) to service_role;

/** A failed AI call: the service, the HTTP status and the error kind — never the question or who asked. */
create or replace function public.ai_error_add(p_service text, p_status int, p_kind text)
returns void language sql security definer set search_path = '' as $$
  insert into private.ai_errors (service, status, kind)
  values (left(coalesce(p_service, '?'), 30), p_status, left(regexp_replace(coalesce(p_kind, ''), '[^A-Za-z0-9_ .:-]', '', 'g'), 60));
$$;
revoke all on function public.ai_error_add(text, int, text) from public, anon, authenticated;
grant execute on function public.ai_error_add(text, int, text) to service_role;

/** The website guide: who (hashed) and whether their budget for today has room. */
create or replace function public.guide_chat_who(p_ip text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('who', private.ai_who('ip:' || coalesce(p_ip, '')),
                            'room', private.ai_used_today(private.ai_who('ip:' || coalesce(p_ip, '')), 'guide') < private.ai_budget())
$$;
revoke all on function public.guide_chat_who(text) from public, anon, authenticated;
grant execute on function public.guide_chat_who(text) to service_role;

-- The app chat: its budget per person, and the hash it reports usage under.
select private.patch_function('public.app_chat_context(text)',
  $p$  if not v_ok then
    insert into private.guide_usage as u (refused) values (1) on conflict (day) do update set refused = u.refused + 1;
    return jsonb_build_object('allowed', false, 'reason', 'busy');
  end if;$p$,
  $p$  if v_ok and private.ai_used_today(private.ai_who(v_key), 'app') >= private.ai_budget() then
    v_ok := false;
  end if;
  if not v_ok then
    insert into private.guide_usage as u (refused) values (1) on conflict (day) do update set refused = u.refused + 1;
    return jsonb_build_object('allowed', false, 'reason', 'busy');
  end if;$p$);
select private.patch_function('public.app_chat_context(text)',
  $p$return jsonb_build_object('allowed', true, 'who', 'student', 'now', now(),$p$,
  $p$return jsonb_build_object('allowed', true, 'who', 'student', 'usage_key', private.ai_who(v_key), 'now', now(),$p$);
select private.patch_function('public.app_chat_context(text)',
  $p$  return jsonb_build_object('allowed', true, 'who', 'staff', 'now', now(),$p$,
  $p$  return jsonb_build_object('allowed', true, 'who', 'staff', 'usage_key', private.ai_who(v_key), 'now', now(),$p$);

/** For the owner: the heaviest users today (hashes only) and the last errors. */
create or replace function public.staff_ai_usage_detail()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'budget', private.ai_budget(),
    'top', coalesce((select jsonb_agg(jsonb_build_object('who', left(u.who, 6), 'service', u.service, 'calls', u.calls, 'tokens', u.input_tokens + u.output_tokens) order by u.input_tokens + u.output_tokens desc)
                       from (select * from private.ai_usage_by where day = (now() at time zone 'Africa/Cairo')::date order by input_tokens + output_tokens desc limit 10) u), '[]'),
    'people_today', (select count(distinct who) from private.ai_usage_by where day = (now() at time zone 'Africa/Cairo')::date),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'service', e.service, 'status', e.status, 'kind', e.kind) order by e.at desc)
                          from (select * from private.ai_errors order by at desc limit 20) e), '[]'),
    'errors_week', (select count(*) from private.ai_errors where at > now() - interval '7 days')
  );
end $$;
revoke all on function public.staff_ai_usage_detail() from public, anon;
grant execute on function public.staff_ai_usage_detail() to authenticated;
