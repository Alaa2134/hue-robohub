-- Certificate designs: each certificate can use one of the BuildX HUE certificate artworks
-- (Appreciation, or Achievement for a track). Empty means the app picks one from the kind and title.
alter table public.certificates add column if not exists design text
  check (design in ('appreciation', 'robotics', 'ai', 'software', 'hardware', 'iot', 'cybersecurity', 'design', 'entrepreneurship', 'classic'));

create or replace function public.student_certificates(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.session_student(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'name', c.recipient_name, 'kind', c.kind, 'title', c.title, 'title_ar', c.title_ar,
      'details', c.details, 'details_ar', c.details_ar, 'hours', c.hours, 'issued_on', c.issued_on, 'design', c.design
    ) order by c.issued_on desc, c.created_at desc)
    from public.certificates c where c.student_id = v_id and c.revoked_at is null
  ), '[]'::jsonb);
end $$;
