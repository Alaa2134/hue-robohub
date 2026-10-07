-- Applicants can check where their application stands on the website (/join/status) with their
-- reference and phone number. Staff can leave them a short public message (interview time, next step).

alter table public.applications
  add column public_note text not null default '' check (char_length(public_note) <= 600);

-- Stamp the reviewer when the public message changes too.
create or replace function private.applications_review() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status or new.staff_notes is distinct from old.staff_notes or new.public_note is distinct from old.public_note then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;

/**
 * Status of one application, for the applicant. Both the reference and the phone number must match,
 * and each address gets 10 tries per 15 minutes, so references can't be guessed. Only the first name,
 * the first track, the status, the dates and the public message are returned.
 */
create or replace function public.application_status(p_ref text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_app public.applications%rowtype;
begin
  if not private.throttle('app_status', 10, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_ref !~ '^BX-?[0-9A-F]{6}$' or v_phone !~ '^\+?[0-9]{8,15}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_ref !~ '^BX-' then
    v_ref := 'BX-' || substr(v_ref, 3);
  end if;
  if v_phone ~ '^01[0-9]{9}$' then
    v_phone := '+2' || v_phone;
  elsif v_phone ~ '^00[0-9]+$' then
    v_phone := '+' || substr(v_phone, 3);
  end if;

  select * into v_app from public.applications where ref = v_ref and phone = v_phone;
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

revoke execute on function public.application_status(text, text) from public;
grant execute on function public.application_status(text, text) to anon, authenticated;
revoke execute on function private.applications_review() from public, anon, authenticated;
