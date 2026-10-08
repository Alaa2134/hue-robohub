-- Certificate designs: the 20 team and organizer artworks (Organizer, Volunteer, Mentor, Judge…)
-- join the track ones. Only the list of allowed design names changes; no certificate is touched.
alter table public.certificates drop constraint if exists certificates_design_check;
alter table public.certificates add constraint certificates_design_check check (design in (
  'classic', 'appreciation', 'robotics', 'ai', 'software', 'hardware', 'iot', 'cybersecurity', 'design', 'entrepreneurship',
  'organizer', 'core-team', 'team-leader', 'track-lead', 'volunteer', 'event-coordinator', 'media-design', 'technical',
  'pr-partnerships', 'operations', 'registration', 'social-media', 'photography', 'mentor', 'speaker',
  'workshop-instructor', 'judge', 'sponsor', 'outstanding-member', 'ambassador'
));
