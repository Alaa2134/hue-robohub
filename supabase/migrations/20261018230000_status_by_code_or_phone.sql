-- «تابع طلبك» with the code or the mobile number, either one is enough:
--   • the code alone (or with any number) gives the full answer, as before: status, next step, QR;
--   • the number alone (or with a code that matches nothing) lists that number's requests: which
--     form, its status and when, without the name or the QR, since anyone can know someone's number.
-- «سجّلت في موقع المعرض» needs only the code.

create or replace function public.form_status(p_ref text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.form_responses;
  f public.forms;
  v_phone text := private.clean_phone(p_phone);
  v_list jsonb;
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if private.code_key(p_ref) is not null then
    select * into r from public.form_responses where ref = private.form_ref(p_ref);
  end if;
  if r.id is null then
    if coalesce(v_phone, '') ~ '^\+?[0-9]{8,15}$' then
      select jsonb_agg(x order by x ->> 'at' desc) into v_list from (
        select jsonb_build_object('title_ar', f2.title_ar, 'title_en', f2.title_en, 'status', r2.status, 'at', r2.created_at) as x
          from public.form_responses r2 join public.forms f2 on f2.id = r2.form_id
         where private.clean_phone(r2.phone) = v_phone
         order by r2.created_at desc limit 10) s;
      if v_list is not null then
        return jsonb_build_object('ok', true, 'list', v_list);
      end if;
    end if;
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
   where ref = private.form_ref(p_ref) and status = 'accepted';
  return jsonb_build_object('ok', found);
end $$;
