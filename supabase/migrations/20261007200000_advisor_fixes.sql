-- Advisor follow-ups: Supabase grants new functions to anon directly, so `revoke ... from public`
-- alone leaves these staff-only functions callable by anon (they refuse inside, but shouldn't be reachable).
revoke execute on function public.staff_check_in(uuid, text), public.staff_leaderboard(text) from anon;

create index if not exists blocked_ips_created_by_idx on private.blocked_ips (created_by);
