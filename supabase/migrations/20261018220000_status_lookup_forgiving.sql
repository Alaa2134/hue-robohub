-- «تابع طلبك» answered «مش لاقيين» for codes and numbers typed the way people type them:
--   • the code without «F-» (82511139), in lower case, with spaces, or in Arabic digits (٨٢٥١١١٣٩)
--   • the mobile number in Arabic digits (٠١١…), or as 2011… / 11… without the leading 0
-- Codes and numbers are now read the way they are meant on both status pages, a form code typed on the
-- join page (or a join code on the form page) says where to look instead of «not found», and numbers
-- in Arabic digits are kept when a form is sent.

create or replace function private.clean_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v text := regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if v ~ '^01[0-9]{9}$' then return '+2' || v; end if;
  if v ~ '^201[0-9]{9}$' then return '+' || v; end if;
  if v ~ '^1[0-9]{9}$' then return '+20' || v; end if;
  if v ~ '^00[0-9]+$' then return '+' || substr(v, 3); end if;
  return v;
end $$;

-- F-XXXXXXXX from however it was typed (82511139, f 82511139, ف-…, Arabic digits).
create or replace function private.form_ref(p text)
returns text language sql immutable set search_path = '' as $$
  select case when k ~ '^F[0-9A-F]{8}$' then 'F-' || substr(k, 2)
              when k ~ '^[0-9A-F]{8}$' then 'F-' || k
              else upper(btrim(coalesce(p, ''))) end
    from (select private.code_key(p) as k) x
$$;
revoke all on function private.form_ref(text) from public, anon, authenticated;

create or replace function public.form_status(p_ref text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from public.form_responses
   where ref = private.form_ref(p_ref) and private.clean_phone(phone) = private.clean_phone(p_phone);
  if not found then
    return jsonb_build_object('ok', false, 'error', case when private.code_key(p_ref) ~ '^BX[0-9A-F]{6}$' then 'join_code' else 'not_found' end);
  end if;
  select * into f from public.forms where id = r.form_id;
  return jsonb_build_object('ok', true, 'status', r.status, 'title_ar', f.title_ar, 'title_en', f.title_en,
    'accepted_ar', case when r.status = 'accepted' then f.accepted_ar end,
    'accepted_url', case when r.status = 'accepted' then f.accepted_url end,
    'external_done', r.external_done_at is not null,
    'pass', case when r.status = 'accepted' and f.delegation is not null and r.member_no is not null then jsonb_build_object(
      'no', 'BX-' || lpad(r.member_no::text, 3, '0'), 'ref', r.ref, 'name', r.name, 'name_en', r.answers ->> 'name_en',
      'day', r.answers ->> 'day', 'org', r.answers ->> 'org',
      'event', f.delegation ->> 'event', 'dates', f.delegation ->> 'dates', 'venue', f.delegation ->> 'venue',
      'meet_ar', nullif(f.delegation ->> 'meet_ar', '')) end,
    'attend_pass', case when coalesce((f.attendance ->> 'on')::boolean, false) and r.status <> 'rejected' then r.pass end);
end $$;

create or replace function public.form_external_done(p_ref text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.form_responses set external_done_at = coalesce(external_done_at, now())
   where ref = private.form_ref(p_ref) and private.clean_phone(phone) = private.clean_phone(p_phone) and status = 'accepted';
  return jsonb_build_object('ok', found);
end $$;

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
    'note', v_app.public_note
  );
end $$;
