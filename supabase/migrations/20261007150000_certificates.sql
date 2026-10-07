-- Certificates: issued from the BuildX App (one at a time or for a whole group), printed as A4 with a
-- QR code, and checked by anyone at buildxhue.com/verify/?c=<code>. Students see theirs in the app.

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^BXC-[0-9A-F]{8}$'),
  student_id uuid references public.students (id) on delete set null,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 2 and 120),
  kind text not null default 'completion' check (kind in ('completion', 'participation', 'achievement', 'appreciation')),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  title_ar text check (char_length(title_ar) <= 140),
  details text check (char_length(details) <= 300),
  details_ar text check (char_length(details_ar) <= 300),
  hours int check (hours between 1 and 2000),
  issued_on date not null default (now() at time zone 'Africa/Cairo')::date,
  revoked_at timestamptz,
  revoked_reason text check (char_length(revoked_reason) <= 200),
  issued_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index certificates_student_idx on public.certificates (student_id);
create index certificates_issued_idx on public.certificates (issued_on desc, created_at desc);
create index certificates_issued_by_idx on public.certificates (issued_by);

alter table public.certificates enable row level security;
create policy certificates_select on public.certificates for select to authenticated using ((select private.is_staff()));
create policy certificates_insert on public.certificates for insert to authenticated with check ((select private.is_staff()));
create policy certificates_update on public.certificates for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update on public.certificates to authenticated;

create trigger certificates_audit after insert or update on public.certificates
  for each row execute function private.audit();

/** A fresh certificate code (BXC- + 8 hex). Codes are random so they can't be listed by counting. */
create or replace function private.certificate_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v text;
begin
  loop
    v := 'BXC-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.certificates where code = v);
  end loop;
  return v;
end $$;
alter table public.certificates alter column code set default private.certificate_code();

/** Public check of one certificate. 60 checks per address per 10 minutes. */
create or replace function public.verify_certificate(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  c public.certificates%rowtype;
begin
  if not private.throttle('verify_cert', 60, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_code ~ '^BXC[0-9A-F]{8}$' then
    v_code := 'BXC-' || substr(v_code, 4);
  end if;
  if v_code !~ '^BXC-[0-9A-F]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into c from public.certificates where code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'ok', true,
    'code', c.code,
    'name', c.recipient_name,
    'kind', c.kind,
    'title', c.title,
    'title_ar', c.title_ar,
    'details', c.details,
    'details_ar', c.details_ar,
    'hours', c.hours,
    'issued_on', c.issued_on,
    'revoked', c.revoked_at is not null,
    'revoked_on', (c.revoked_at at time zone 'Africa/Cairo')::date
  );
end $$;

/** The signed-in student's certificates (BuildX App → student). */
create or replace function public.student_certificates(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'name', c.recipient_name, 'kind', c.kind, 'title', c.title, 'title_ar', c.title_ar,
      'details', c.details, 'details_ar', c.details_ar, 'hours', c.hours, 'issued_on', c.issued_on
    ) order by c.issued_on desc, c.created_at desc)
    from public.certificates c where c.student_id = v_id and c.revoked_at is null
  ), '[]'::jsonb);
end $$;

-- The column default runs as the inserting staff member, so they need to be able to call it.
revoke execute on function private.certificate_code() from public, anon;
grant execute on function private.certificate_code() to authenticated;
revoke execute on function public.verify_certificate(text), public.student_certificates(text) from public;
grant execute on function public.verify_certificate(text), public.student_certificates(text) to anon, authenticated;
