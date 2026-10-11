-- Printed team member cards (src/portal/team-cards.tsx): each profile keeps its faculty and the member
-- code printed on the card (e.g. BX-WEB-2026). Both are filled in by the app when empty and can be
-- edited; the code is unique so two cards never carry the same one.
alter table public.team_profiles
  add column if not exists faculty text check (char_length(faculty) <= 120),
  add column if not exists card_code text check (char_length(card_code) <= 30 and card_code ~ '^[A-Z0-9][A-Z0-9-]+$');
create unique index if not exists team_profiles_card_code_key on public.team_profiles (card_code) where card_code is not null;
