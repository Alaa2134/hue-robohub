-- Paid forms: a form can ask for a fee, and the team marks who paid and who didn't.
--   forms.payment            {on, amount, note_ar, note_en}: the fee in EGP and how to pay
--                            (Vodafone Cash / InstaPay number…), shown on the form and the status page.
--   form_responses.paid_at   when the team marked it paid (null = not paid yet),
--   paid_amount / paid_method / paid_by: how much, how, and which team member marked it.
-- Marking is done by staff who can manage the form (the existing update policy); paid_by and the
-- default amount are filled in here, not trusted from the client.

alter table public.forms add column if not exists payment jsonb;
do $$ begin
if not exists (select 1 from pg_constraint where conname = 'forms_payment_ok') then
alter table public.forms add constraint forms_payment_ok check (
  payment is null or (
    jsonb_typeof(payment) = 'object'
    and jsonb_typeof(coalesce(payment -> 'on', 'false'::jsonb)) = 'boolean'
    and (payment -> 'amount' is null or (jsonb_typeof(payment -> 'amount') = 'number' and (payment ->> 'amount')::numeric between 0 and 1000000))
    and length(coalesce(payment ->> 'note_ar', '')) <= 600
    and length(coalesce(payment ->> 'note_en', '')) <= 600
  )
);
end if;
end $$;

alter table public.form_responses
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(10, 2),
  add column if not exists paid_method text,
  add column if not exists paid_by uuid;
do $$ begin
if not exists (select 1 from pg_constraint where conname = 'form_responses_paid_ok') then
alter table public.form_responses add constraint form_responses_paid_ok check (
  (paid_amount is null or paid_amount between 0 and 1000000)
  and (paid_method is null or paid_method in ('cash', 'vodafone_cash', 'instapay', 'bank', 'other'))
);
end if;
end $$;
create index if not exists form_responses_unpaid_idx on public.form_responses (form_id) where paid_at is null;

create or replace function private.form_response_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.paid_at is null then
    new.paid_amount := null;
    new.paid_method := null;
    new.paid_by := null;
  elsif old.paid_at is distinct from new.paid_at or old.paid_amount is distinct from new.paid_amount or old.paid_method is distinct from new.paid_method then
    new.paid_by := auth.uid();
    if new.paid_amount is null then
      select (f.payment ->> 'amount')::numeric into new.paid_amount from public.forms f where f.id = new.form_id;
    end if;
  else
    new.paid_by := old.paid_by;
  end if;
  return new;
end $$;
revoke all on function private.form_response_paid() from public, anon, authenticated;

create or replace trigger form_responses_paid before update of paid_at, paid_amount, paid_method, paid_by on public.form_responses
  for each row execute function private.form_response_paid();

-- The fee and how to pay, on the public form.
create or replace function public.public_form(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', f.slug, 'title_ar', f.title_ar, 'title_en', f.title_en, 'intro_ar', f.intro_ar, 'intro_en', f.intro_en,
    'success_ar', f.success_ar, 'success_en', f.success_en, 'fields', f.fields, 'team', f.team,
    'open', private.form_is_open(f), 'opens_at', f.opens_at, 'closes_at', f.closes_at,
    'background_path', f.background_path, 'background_kind', f.background_kind,
    'payment', case when coalesce((f.payment ->> 'on')::boolean, false) then jsonb_build_object(
      'amount', f.payment -> 'amount', 'note_ar', nullif(f.payment ->> 'note_ar', ''), 'note_en', nullif(f.payment ->> 'note_en', '')) end
  )
  from public.forms f where f.slug = lower(btrim(p_slug)) and not f.archived
$$;

-- «تابع طلبك» with the code also says whether the fee is paid (only with the code: the number-only
-- list stays as it was).
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
    'attend_pass', case when coalesce((f.attendance ->> 'on')::boolean, false) and r.status <> 'rejected' then r.pass end,
    'payment', case when coalesce((f.payment ->> 'on')::boolean, false) and r.status <> 'rejected' then jsonb_build_object(
      'amount', f.payment -> 'amount', 'note_ar', nullif(f.payment ->> 'note_ar', ''), 'note_en', nullif(f.payment ->> 'note_en', ''),
      'paid', r.paid_at is not null) end);
end $$;
