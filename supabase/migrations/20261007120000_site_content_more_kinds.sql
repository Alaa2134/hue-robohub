-- BuildX HUE — FAQ, testimonials and partners from the BuildX App, and scheduled publishing.
alter type public.site_content_kind add value if not exists 'faq';
alter type public.site_content_kind add value if not exists 'testimonial';
alter type public.site_content_kind add value if not exists 'partner';

-- Scheduled publishing: a published item stays hidden from visitors until publish_at.
alter table public.site_content add column if not exists publish_at timestamptz;
alter policy site_content_public on public.site_content using (published and (publish_at is null or publish_at <= now()));
alter policy site_content_select on public.site_content using ((published and (publish_at is null or publish_at <= now())) or (select private.is_staff()));
create index if not exists site_content_publish_at_idx on public.site_content (publish_at) where publish_at is not null;
