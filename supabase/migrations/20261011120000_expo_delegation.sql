-- Expo visits as a delegation: accepting an applicant registers them in the team's delegation straight
-- away (a delegation number, BX-001, BX-002…), with no step on the expo's own site. The team sends the
-- delegation list (a PDF and an Excel made in the app) to the expo's administration. The applicant's
-- status page shows their delegation pass; the visit page shows how many are going (and seats left).
-- Nothing is removed.

alter table public.forms
  add column if not exists delegation jsonb check (delegation is null or jsonb_typeof(delegation) = 'object'),
  add column if not exists capacity int check (capacity is null or capacity between 1 and 100000);

alter table public.form_responses
  add column if not exists member_no int,
  add column if not exists accepted_at timestamptz;
create unique index if not exists form_responses_member_no_idx on public.form_responses (form_id, member_no) where member_no is not null;

/** Accepted on a delegation form: the next delegation number (kept if they're later moved back), and the time. */
create or replace function private.on_form_accept() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  f public.forms;
begin
  if new.status <> 'accepted' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'accepted' then
      return new;
    end if;
  end if;
  new.accepted_at := coalesce(new.accepted_at, now());
  select * into f from public.forms where id = new.form_id;
  if f.delegation is null or new.member_no is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('delegation:' || new.form_id));
  if f.capacity is not null and (select count(*) from public.form_responses r where r.form_id = new.form_id and r.status = 'accepted' and r.id <> new.id) >= f.capacity then
    raise exception 'delegation_full' using errcode = '23514';
  end if;
  new.member_no := coalesce((select max(r.member_no) from public.form_responses r where r.form_id = new.form_id), 0) + 1;
  return new;
end $$;
revoke execute on function private.on_form_accept() from public, anon, authenticated;
create trigger form_responses_accept before insert or update of status on public.form_responses
  for each row execute function private.on_form_accept();

/** Public: the applicant's status, with their delegation pass once accepted. */
create or replace function public.form_status(p_ref text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.form_responses;
  f public.forms;
begin
  if not private.throttle('form_status', 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from public.form_responses
   where ref = upper(btrim(coalesce(p_ref, ''))) and phone = private.clean_phone(p_phone);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
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
      'meet_ar', nullif(f.delegation ->> 'meet_ar', '')) end);
end $$;
revoke execute on function public.form_status(text, text) from public;
grant execute on function public.form_status(text, text) to anon, authenticated;

/** Public: how many are in a listed form's delegation (by day), and the seats if there's a limit. */
create or replace function public.form_delegation(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('accepted', count(r.id), 'capacity', f.capacity,
           'days', coalesce((select jsonb_object_agg(d, n) from (select r2.answers ->> 'day' as d, count(*) as n from public.form_responses r2
                              where r2.form_id = f.id and r2.status = 'accepted' and r2.answers ->> 'day' is not null group by 1) x), '{}'::jsonb))
    from public.forms f
    left join public.form_responses r on r.form_id = f.id and r.status = 'accepted'
   where f.slug = p_slug and f.listed and f.delegation is not null
   group by f.id, f.capacity
$$;
revoke execute on function public.form_delegation(text) from public;
grant execute on function public.form_delegation(text) to anon, authenticated;

-- Robotex: a delegation. Accepted = registered; the team sends the list to the expo.
update public.forms set
  delegation = coalesce(delegation, jsonb_build_object(
    'event', 'Robotex & NDTX Expo 2026',
    'venue', 'Egypt International Exhibition Center (EIEC), New Cairo',
    'dates', '14–16 November 2026',
    'org', 'BuildX HUE — Horus University Egypt',
    'lead_name', '', 'lead_phone', '', 'meet_ar', '')),
  accepted_url = null,
  accepted_ar = 'اتقبلت واتسجلت في وفد BuildX HUE لمعرض Robotex 🎉 مش محتاج تسجّل في أي موقع: الفريق بيبعت كشف الوفد لإدارة المعرض. خد سكرين شوت لتصريح الوفد اللي تحت، وميعاد ومكان التجمع هيوصلوك على واتساب.'
 where slug = 'robotex-2026';
