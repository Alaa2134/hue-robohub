-- BuildX HUE — security review fixes.
--   1. Re-sending a form no longer hands back someone else's data: event registration with a
--      known phone no longer returns that person's ticket, and the application form no longer
--      returns their reference (both were enough to read or cancel someone else's).
--   2. The sponsorship form keeps a website only when it's a plain http(s) link.
--   3. Bot timer: contact/sponsorship, waitlist and app-built forms sent faster than a person can
--      fill them in are ignored quietly (like the honeypot).
--   4. staff_whoami(): the staff-admin Edge Function asks the database who is calling, with the
--      caller's own session, so two-factor (aal2) is required there like everywhere else.
--   5. Push subscriptions only to the real push services; two missing foreign-key indexes.
-- The function changes patch one line of the existing definitions in place (and fail loudly if
-- that line isn't there). Nothing is removed.

-- ─────────────────────────────────────────────────────────────── helpers
/** Swap one exact piece of a function's definition and recreate it; error if it isn't found. */
create or replace function private.patch_function(p_fn regprocedure, p_from text, p_to text) returns void
language plpgsql set search_path = ''
as $$
declare
  d text := pg_get_functiondef(p_fn);
begin
  if position(p_from in d) = 0 then
    raise exception 'patch_function: % does not contain the expected text', p_fn;
  end if;
  execute replace(d, p_from, p_to);
end $$;
revoke execute on function private.patch_function(regprocedure, text, text) from public, anon, authenticated;

/** Milliseconds a public form says it took; anything unreadable counts as slow (a person). */
create or replace function private.form_ms(p text) returns bigint
language sql immutable set search_path = ''
as $$
  select case when p ~ '^[0-9]{1,9}$' then p::bigint else 99999 end
$$;
revoke execute on function private.form_ms(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 1. no data back on duplicates
select private.patch_function('public.register_event(uuid, jsonb)',
  $p$return jsonb_build_object('ok', true, 'ticket', v_reg.ticket, 'status', v_reg.status, 'duplicate', true);$p$,
  $p$return jsonb_build_object('ok', true, 'duplicate', true);$p$);

select private.patch_function('public.submit_application(jsonb)',
  $p$return jsonb_build_object('ok', true, 'ref', v_ref, 'duplicate', true);$p$,
  $p$return jsonb_build_object('ok', true, 'duplicate', true);$p$);

-- ─────────────────────────────────────────────────────────────── 2 + 3. messages
select private.patch_function('public.submit_message(jsonb)',
  $p$'website', nullif(left(btrim(p ->> 'site'), 300), ''),$p$,
  $p$'website', case when btrim(coalesce(p ->> 'site', '')) ~* '^https?://[^[:space:]<>"]+$' then left(btrim(p ->> 'site'), 300) end,$p$);

select private.patch_function('public.submit_message(jsonb)',
  $p$  if coalesce(p ->> 'website', '') <> '' then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'message'));$p$,
  $p$  if coalesce(p ->> 'website', '') <> '' or private.form_ms(p ->> 'elapsed') < 1500 then
    perform private.log_security('honeypot', 2, jsonb_build_object('form', 'message'));$p$);

-- ─────────────────────────────────────────────────────────────── 3. waitlist and app-built forms
select private.patch_function('public.join_waitlist(jsonb)',
  $p$  if coalesce(p ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true);$p$,
  $p$  if coalesce(p ->> 'website', '') <> '' or private.form_ms(p ->> 'elapsed') < 1500 then
    return jsonb_build_object('ok', true);$p$);

select private.patch_function('public.submit_form(text, jsonb, text, text)',
  $p$  if coalesce(p_website, '') <> '' then$p$,
  $p$  if coalesce(p_website, '') <> '' or (jsonb_typeof(p_answers) = 'object' and private.form_ms(p_answers ->> '__t') < 1500) then$p$);

-- ─────────────────────────────────────────────────────────────── 4. staff-admin authorisation
/** The caller's staff role, only when the database would let them in (active, two-factor done). */
create or replace function public.staff_whoami() returns text
language sql stable security definer set search_path = ''
as $$
  select s.role from public.staff s where s.user_id = auth.uid() and s.active and private.mfa_ok()
$$;
revoke execute on function public.staff_whoami() from public, anon;
grant execute on function public.staff_whoami() to authenticated;

-- ─────────────────────────────────────────────────────────────── 5. push endpoints, indexes
-- Only the browsers' push services (checked for new rows; existing rows are left as they are).
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host
  check (endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/')
  not valid;

create index if not exists forms_created_by_idx on public.forms (created_by);
create index if not exists inbox_messages_handled_by_idx on public.inbox_messages (handled_by);
