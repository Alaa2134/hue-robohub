-- From the security review:
--  * event_feedback_of(ticket) gets the same rate limit as the other ticket lookups (60 per 10 min
--    per IP), so tickets can't be guessed through it.
--  * client_ip(): when Cloudflare's header is missing, use the last x-forwarded-for entry (added by
--    the gateway) instead of the first (which the client can set), so rate limits can't be dodged.

create or replace function public.event_feedback_of(p_ticket text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.throttle('ticket', 60, interval '10 minutes') then
    return null;
  end if;
  return (
    select jsonb_build_object('rating', f.rating, 'comment', f.comment, 'publish_ok', f.publish_ok)
      from public.event_feedback f join public.event_registrations g on g.id = f.registration_id
     where g.ticket = private.norm_ticket(p_ticket)
  );
end $$;
revoke execute on function public.event_feedback_of(text) from public;
grant execute on function public.event_feedback_of(text) to anon, authenticated;

create or replace function private.client_ip() returns text
language sql stable set search_path = ''
as $$
  select nullif(left(btrim(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    (select (regexp_split_to_array(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', '\s*,\s*'))[
       array_length(regexp_split_to_array(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', '\s*,\s*'), 1)]),
    '')), 64), '')
$$;
