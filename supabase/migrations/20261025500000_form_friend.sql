-- "Coming with a friend": a question where someone types their friend's mobile number or request
-- code (or membership number). The site looks the friend up among the people who already signed up
-- to the same form and shows their name so they can confirm it's them; the answer saved is the
-- friend's request code, which the team sees as a name in the app.

-- The lookup only works on an open form that has such a question, only finds people in that same
-- form (not rejected), shows the first two words of the name, and is rate limited per IP.
create or replace function public.form_friend(p_slug text, p_query text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  q text := upper(regexp_replace(translate(coalesce(p_query, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\s', '', 'g'));
  v_phone text;
  v_ref text;
  v_name text;
begin
  if not private.throttle('form_friend', 60, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into f from public.forms where slug = lower(btrim(p_slug)) and not archived;
  if not found or not private.form_is_open(f)
     or not exists (select 1 from jsonb_array_elements(f.fields) x where x ->> 'type' = 'friend') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(q) < 4 or char_length(q) > 40 then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  if q ~ '^F-?[0-9A-F]{8}$' then
    select r.ref, r.name into v_ref, v_name from public.form_responses r
     where r.form_id = f.id and r.status <> 'rejected' and r.ref = 'F-' || right(q, 8);
  else
    v_phone := private.clean_phone(q);
    if v_phone ~ '^\+?[0-9]{7,16}$' then
      select r.ref, r.name into v_ref, v_name from public.form_responses r
       where r.form_id = f.id and r.status <> 'rejected' and r.phone = v_phone
       order by r.created_at limit 1;
    end if;
    if v_ref is null then
      select r.ref, r.name into v_ref, v_name from public.form_responses r
        join public.students s on s.id = r.student_id
       where r.form_id = f.id and r.status <> 'rejected' and s.code_key = private.code_key(p_query)
       order by r.created_at limit 1;
    end if;
  end if;

  if v_ref is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  return jsonb_build_object('ok', true, 'found', true, 'ref', v_ref,
    'name', coalesce(nullif(array_to_string((regexp_split_to_array(btrim(coalesce(v_name, '')), '\s+'))[1:2], ' '), ''), v_ref));
end $$;

revoke execute on function public.form_friend(text, text) from public;
grant execute on function public.form_friend(text, text) to anon, authenticated;

-- submit_form: a friend answer must be the request code of someone in the same form.
do $$
declare
  def text := pg_get_functiondef('public.submit_form(text, jsonb, text, text)'::regprocedure);
  anchor text := E'    if v_type = ''member'' then\n';
begin
  if position('''friend''' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'submit_form changed: no member check to add the friend check before';
  end if;
  def := replace(def, anchor,
    E'    if v_type = ''friend'' then\n'
    || E'      v_text := upper(regexp_replace(v_text, ''\\s'', '''', ''g''));\n'
    || E'      if not exists (select 1 from public.form_responses where form_id = f.id and ref = v_text and status <> ''rejected'') then\n'
    || E'        v_errors := v_errors || jsonb_build_object(v_id, ''friend''); continue;\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || anchor);
  execute def;
end $$;

-- The team can type or pick a friend's code when editing someone by hand.
do $$
declare
  def text := pg_get_functiondef('public.staff_form_response_save(uuid, uuid, jsonb, text)'::regprocedure);
  anchor text := E'    if v_type = ''email'' then v_text := lower(v_text); end if;\n';
begin
  if position('''friend''' in def) > 0 then
    return;
  end if;
  if position(anchor in def) = 0 then
    raise exception 'staff_form_response_save changed: no email line to add the friend line after';
  end if;
  def := replace(def, anchor, anchor || E'    if v_type = ''friend'' then v_text := upper(regexp_replace(v_text, ''\\s'', '''', ''g'')); end if;\n');
  execute def;
end $$;
