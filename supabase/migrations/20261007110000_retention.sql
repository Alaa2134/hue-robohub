-- BuildX HUE — daily clean-up of security, rate-limit and analytics records (03:17 Cairo).
-- Not applied yet: it deletes rows, so it waits for the owner's approval.
select cron.schedule('buildx-retention', '17 0 * * *', $$
  delete from private.rate_counters where window_start < now() - interval '2 days';
  delete from private.rate_hits where at < now() - interval '1 day';
  delete from private.security_events where at < now() - interval '180 days';
  delete from private.blocked_ips where until is not null and until < now() - interval '30 days';
  delete from private.analytics_salt where day < (now() at time zone 'Africa/Cairo')::date - 1;
  delete from private.page_views where at < now() - interval '400 days';
  delete from private.client_errors where last_at < now() - interval '90 days';
$$);
