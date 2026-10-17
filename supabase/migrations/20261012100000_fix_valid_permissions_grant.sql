-- The email migration re-applied the revoke on private.valid_permissions, which the staff table's check
-- constraint calls as whoever writes the row: adding a team member (service role) failed with
-- "permission denied for function valid_permissions". It's a pure check, so those roles may run it.
grant execute on function private.valid_permissions(text[]) to service_role, authenticated;
