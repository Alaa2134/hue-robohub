-- The delegation on the day: when each delegate arrived (the team scans their pass QR at the meeting
-- point or the gate), and when the team sent them the acceptance message on WhatsApp (so a message
-- queue can show who's left, from any phone). Staff set both through the existing update policy.
alter table public.form_responses
  add column if not exists checked_in_at timestamptz,
  add column if not exists messaged_at timestamptz;
