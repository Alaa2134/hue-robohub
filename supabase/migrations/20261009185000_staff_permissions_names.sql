-- The list of permission names a member can hold: the "security" area (20261009180000) and the finer
-- training and website parts (20261009190000). The old "students" and "content" stay valid.
alter table public.staff drop constraint if exists staff_permissions_check;
alter table public.staff add constraint staff_permissions_check check (permissions <@ array[
  'applications', 'students', 'events', 'content', 'inbox', 'certificates', 'publish', 'settings', 'portfolios', 'notify', 'security',
  'roster', 'attendance', 'quizzes', 'tasks', 'materials', 'announcements', 'points', 'site', 'forms']);
