-- "I don't know my membership number": on a form that asks for it, a member types the mobile number
-- they registered with and the site finds them — it shows the first two words of their name and their
-- membership number (filled in for them, to keep for next time). The membership number box also
-- takes that mobile number directly.
--
-- Membership numbers aren't secrets (they're printed on the card and signing in also needs the PIN),
-- but the lookup is still kept narrow: only on an open form that has a membership question, rate
-- limited per IP, and an expired or stopped membership gets no number back, only what to do.

create or replace function public.form_member(p_slug text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  v_phone text := private.clean_phone(left(coalesce(p_phone, ''), 40));
  s public.students;
  v_state text;
begin
  if not private.throttle('form_member', 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into f from public.forms where slug = lower(btrim(p_slug)) and not archived;
  if not found or not private.form_is_open(f)
     or not exists (select 1 from jsonb_array_elements(f.fields) x where x ->> 'type' = 'member') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_phone is null or v_phone !~ '^\+[0-9]{10,15}$' then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  select * into s from public.students x
   where x.phone is not null and private.clean_phone(x.phone) = v_phone
   order by x.active desc, x.created_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  v_state := case
    when not s.active or private.is_banned(v_phone, s.id) then 'stopped'
    when s.member_until is not null and s.member_until < private.cairo_today() then 'expired'
    else 'ok' end;
  return jsonb_build_object('ok', true, 'found', true, 'state', v_state,
    'name', coalesce(nullif(array_to_string((regexp_split_to_array(btrim(s.full_name), '\s+'))[1:2], ' '), ''), '—'),
    'code', case when v_state = 'ok' then s.code end,
    'until', case when v_state = 'expired' then s.member_until end);
end $$;

revoke execute on function public.form_member(text, text) from public;
grant execute on function public.form_member(text, text) to anon, authenticated;

-- submit_form: the membership box also takes the member's registered mobile number (saved as their
-- membership number, like a typed one).
select private.patch_function('public.submit_form(text, jsonb, text, text)',
  $p$(s.code_key = private.code_key(v_text) or s.card_token = private.card_of(v_text));$p$,
  $p$(s.code_key = private.code_key(v_text) or s.card_token = private.card_of(v_text)
           or (private.clean_phone(v_text) ~ '^\+[0-9]{10,15}$' and s.phone is not null and private.clean_phone(s.phone) = private.clean_phone(v_text)))
         order by s.created_at desc limit 1;$p$);
