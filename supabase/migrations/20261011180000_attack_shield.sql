-- Attack shield.
--  1. Automatic blocking: an address that keeps tripping the defences is blocked on its own (a bot
--     filling the hidden honeypot field 3 times in an hour: 24 hours; 8 refused bursts against the
--     rate limits in an hour, or 40 failed sign-ins: 6 hours). The thresholds are high on purpose: a
--     whole campus can share one address. The team sees and lifts blocks in Security (الأمان).
--  2. A gate in front of the whole API: PostgREST runs public.request_gate() before every request, so
--     a blocked address can't read or call anything (HTTP 403), not just the rate-limited forms.
--     Signed-in team members are never stopped by it, so they can always reach the unblock screen.

/** Logs a security event, and blocks the address when it keeps attacking. */
create or replace function private.log_security(p_kind text, p_severity int, p_detail jsonb default '{}') returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ip text := private.client_ip();
  v_honey int;
  v_rate int;
  v_fail int;
  v_hours int;
begin
  insert into private.security_events (kind, severity, ip, detail) values (p_kind, p_severity, v_ip, coalesce(p_detail, '{}'));
  if v_ip is null or p_kind not in ('honeypot', 'rate_limited', 'login_failed')
     or exists (select 1 from private.blocked_ips where ip = v_ip and (until is null or until > now())) then
    return;
  end if;
  select count(*) filter (where kind = 'honeypot'), count(*) filter (where kind = 'rate_limited'), count(*) filter (where kind = 'login_failed')
    into v_honey, v_rate, v_fail
    from private.security_events where ip = v_ip and at > now() - interval '1 hour';
  v_hours := case when v_honey >= 3 then 24 when v_rate >= 8 or v_fail >= 40 then 6 end;
  if v_hours is null then
    return;
  end if;
  insert into private.blocked_ips (ip, reason, until)
  values (v_ip, format('تلقائي: %s فخ بوتات، %s تجاوز للحد، %s دخول غلط في ساعة', v_honey, v_rate, v_fail), now() + make_interval(hours => v_hours))
  on conflict (ip) do update set reason = excluded.reason, until = excluded.until, created_by = null, created_at = now();
  insert into private.security_events (kind, severity, ip, detail)
  values ('auto_blocked', 3, v_ip, jsonb_build_object('hours', v_hours, 'honeypot', v_honey, 'rate_limited', v_rate, 'login_failed', v_fail));
end $$;
revoke execute on function private.log_security(text, int, jsonb) from public, anon, authenticated;

/** Before every API request: a blocked address gets 403 (team members signed in are let through). */
create or replace function public.request_gate() returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ip text := private.client_ip();
begin
  if v_ip is null then
    return;
  end if;
  if exists (select 1 from private.blocked_ips where ip = v_ip and (until is null or until > now())) and not private.is_staff() then
    raise sqlstate 'PT403' using message = 'blocked', detail = 'Requests from this network are blocked after repeated abuse.', hint = 'Contact the BuildX HUE team if this is a mistake.';
  end if;
end $$;
revoke execute on function public.request_gate() from public;
grant execute on function public.request_gate() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request = 'public.request_gate';
notify pgrst, 'reload config';
