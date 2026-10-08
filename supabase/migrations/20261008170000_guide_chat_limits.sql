-- Baqloz's AI chat (Edge Function bakloz-chat): rate limits per visitor IP and for the whole site,
-- so the AI's bill can't run away. The function passes the visitor's IP (it calls with the service
-- role, so private.client_ip() would be the function's own address). Nothing is dropped or changed.

create or replace function private.throttle_ip(p_bucket text, p_ip text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2026-01-01 00:00:00+00');
  v_n int;
begin
  if exists (select 1 from private.blocked_ips where ip = v_ip and (until is null or until > now())) then
    return false;
  end if;
  insert into private.rate_counters as c (bucket, ip, window_start, n) values (p_bucket, v_ip, v_start, 1)
  on conflict (bucket, ip, window_start) do update set n = c.n + 1
  returning n into v_n;
  if v_n = p_max + 1 then
    insert into private.security_events (kind, severity, ip, detail)
    values ('rate_limited', 2, v_ip, jsonb_build_object('bucket', p_bucket, 'limit', p_max, 'window', p_window::text));
  end if;
  return v_n <= p_max;
end $$;

revoke execute on function private.throttle_ip(text, text, int, interval) from public, anon, authenticated;

/** May this visitor ask the AI now? 20 questions per 10 minutes each, 2000 a day for the whole site. */
create or replace function public.guide_chat_allow(p_ip text) returns boolean
language sql security definer set search_path = ''
as $$
  select private.throttle_ip('guide_ai', p_ip, 20, interval '10 minutes')
     and private.throttle_ip('guide_ai_day', 'site', 2000, interval '1 day')
$$;

revoke execute on function public.guide_chat_allow(text) from public, anon, authenticated;
grant execute on function public.guide_chat_allow(text) to service_role;
