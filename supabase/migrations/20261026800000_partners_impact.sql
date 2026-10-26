-- Partners portal and verified impact reports. A report is issued for a period from the records
-- (staff_sponsor_report plus the Lab: challenges passed, prints delivered) and frozen with a code
-- (BXR-…) and a SHA-256 of its numbers. Anyone with the code sees exactly what was issued on
-- /verify/report, and each partner has a private link (/partner?t=…) listing the reports issued for
-- them. A report can be withdrawn (with a reason, which the verify page shows) but never edited.
-- Run by whoever has the sponsorship inbox. Needs 20261026200000_academy.sql and
-- 20261026700000_print_hub.sql.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  contact text not null default '' check (char_length(contact) <= 200),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.impact_reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'BXR-' || upper(encode(extensions.gen_random_bytes(5), 'hex')),
  partner_id uuid references public.partners(id) on delete set null,
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  data jsonb not null,
  digest text not null,
  issued_by uuid references auth.users(id) on delete set null default auth.uid(),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (char_length(revoked_reason) <= 200)
);
create index if not exists impact_reports_partner on public.impact_reports (partner_id, issued_at desc);
create index if not exists impact_reports_issued_by on public.impact_reports (issued_by);
create index if not exists partners_created_by on public.partners (created_by);

alter table public.partners enable row level security;
alter table public.impact_reports enable row level security;
revoke all on public.partners, public.impact_reports from anon, authenticated;
create trigger partners_audit after insert or update on public.partners for each row execute function private.audit();
create trigger impact_reports_audit after insert or update on public.impact_reports for each row execute function private.audit();

create or replace function public.staff_partners()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('inbox') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'contact', p.contact, 'token', p.token, 'active', p.active,
                                                             'reports', (select count(*) from public.impact_reports r where r.partner_id = p.id and r.revoked_at is null))
                                           order by p.active desc, p.name) from public.partners p), '[]'),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'partner', p.name, 'from', r.period_from, 'to', r.period_to,
                                                            'issued_at', r.issued_at, 'revoked_at', r.revoked_at, 'revoked_reason', r.revoked_reason)
                                          order by r.issued_at desc)
                          from public.impact_reports r left join public.partners p on p.id = r.partner_id), '[]'));
end $$;

/** Add or change a partner; p_new_link replaces their private link (the old one stops working). */
create or replace function public.staff_partner_save(p_id uuid, p_name text, p_contact text, p_active boolean, p_new_link boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if not private.can('inbox') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_id is null then
    insert into public.partners (name, contact, active) values (btrim(p_name), left(coalesce(p_contact, ''), 200), coalesce(p_active, true)) returning id into v_id;
  else
    update public.partners set name = btrim(p_name), contact = left(coalesce(p_contact, ''), 200), active = coalesce(p_active, true),
                               token = case when p_new_link then encode(extensions.gen_random_bytes(24), 'hex') else token end
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

/** Issue a verified report for a period (and a partner, or for anyone): the numbers are frozen. */
create or replace function public.staff_impact_issue(p_partner uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_data jsonb;
  v_code text;
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  if not private.can('inbox') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to > (now() at time zone 'Africa/Cairo')::date then return jsonb_build_object('ok', false, 'error', 'future'); end if;
  if p_partner is not null and not exists (select 1 from public.partners where id = p_partner) then return jsonb_build_object('ok', false, 'error', 'partner'); end if;
  v_data := public.staff_sponsor_report(p_from, p_to) - 'partners' || jsonb_build_object(
    'lab', jsonb_build_object(
      'challenges_passed', (select count(*) from public.lab_challenge_passes c where c.passed_at >= v_from and c.passed_at < v_to),
      'lab_learners', (select count(distinct c.student_id) from public.lab_challenge_passes c where c.passed_at >= v_from and c.passed_at < v_to),
      'prints_delivered', (select count(*) from public.print_jobs j where j.status = 'delivered' and j.updated_at >= v_from and j.updated_at < v_to)));
  insert into public.impact_reports (partner_id, period_from, period_to, data, digest)
  values (p_partner, p_from, p_to, v_data, encode(extensions.digest(v_data::text, 'sha256'), 'hex'))
  returning code into v_code;
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

create or replace function public.staff_impact_revoke(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('inbox') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then return jsonb_build_object('ok', false, 'error', 'reason'); end if;
  update public.impact_reports set revoked_at = now(), revoked_reason = btrim(p_reason) where id = p_id and revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

/** A partner's private page: their name and the reports issued for them. */
create or replace function public.partner_portal(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.partners;
begin
  if not private.throttle('partner_portal', 60, interval '10 minutes') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('ok', true, 'found', false); end if;
  select * into p from public.partners where token = p_token and active;
  if p.id is null then return jsonb_build_object('ok', true, 'found', false); end if;
  return jsonb_build_object('ok', true, 'found', true, 'name', p.name,
    'reports', coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'from', r.period_from, 'to', r.period_to, 'issued_at', r.issued_at,
                                                             'revoked', r.revoked_at is not null) order by r.period_to desc, r.issued_at desc)
                           from public.impact_reports r where r.partner_id = p.id), '[]'));
end $$;

/** Anyone with a report's code: the report exactly as issued (or that it was withdrawn and why). */
create or replace function public.verify_impact_report(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.impact_reports;
begin
  if not private.throttle('verify_impact', 60, interval '10 minutes') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into r from public.impact_reports where code = upper(btrim(coalesce(p_code, '')));
  if r.id is null then return jsonb_build_object('ok', true, 'found', false); end if;
  return jsonb_build_object('ok', true, 'found', true, 'code', r.code, 'from', r.period_from, 'to', r.period_to, 'issued_at', r.issued_at,
                            'partner', (select p.name from public.partners p where p.id = r.partner_id),
                            'revoked_at', r.revoked_at, 'revoked_reason', r.revoked_reason,
                            'data', case when r.revoked_at is null then r.data end, 'digest', r.digest,
                            'intact', r.digest = encode(extensions.digest(r.data::text, 'sha256'), 'hex'));
end $$;

revoke all on function public.staff_partners(), public.staff_partner_save(uuid, text, text, boolean, boolean), public.staff_impact_issue(uuid, date, date),
  public.staff_impact_revoke(uuid, text), public.partner_portal(text), public.verify_impact_report(text) from public;
grant execute on function public.partner_portal(text), public.verify_impact_report(text) to anon, authenticated;
grant execute on function public.staff_partners(), public.staff_partner_save(uuid, text, text, boolean, boolean), public.staff_impact_issue(uuid, date, date),
  public.staff_impact_revoke(uuid, text) to authenticated;
