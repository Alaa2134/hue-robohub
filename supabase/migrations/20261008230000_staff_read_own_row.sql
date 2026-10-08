-- Staff sign-in on a new device: after the password (aal1) a staff member with two-factor turned on
-- couldn't read their own staff row (staff_select needs is_staff(), which needs aal2), so the app
-- said "not an active member" instead of asking for the code. Everyone may now read their own row
-- at any level; everything else (other staff, all data) still needs the code.
create policy staff_select_own on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()));
