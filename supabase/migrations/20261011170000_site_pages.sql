-- Pages the team builds in the app from blocks (a header with a photo, text, cards, steps, a form,
-- "check your application", the day's plan, photos, questions, buttons, a video), dragged into
-- order. The site shows a published page at /p/<slug>; the Robotex visit page is one of them
-- (slug "robotex", shown at /robotex), with the built-in version until the team saves theirs.
-- Writing needs the "site" permission; publishing or hiding a page needs "publish".

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  title_ar text not null check (char_length(title_ar) between 1 and 160),
  title_en text check (title_en is null or char_length(title_en) <= 160),
  description_ar text check (description_ar is null or char_length(description_ar) <= 400),
  description_en text check (description_en is null or char_length(description_en) <= 400),
  accent text not null default '#ff7a45' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array' and octet_length(blocks::text) < 300000),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  published boolean not null default false,
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.site_pages enable row level security;
create policy site_pages_select on public.site_pages for select to authenticated using ((select private.can('site')));
create policy site_pages_insert on public.site_pages for insert to authenticated with check ((select private.can('site')));
create policy site_pages_update on public.site_pages for update to authenticated
  using ((select private.can('site'))) with check ((select private.can('site')));
revoke all on public.site_pages from anon;
grant select, insert, update on public.site_pages to authenticated;

/** Who changed it and when; showing or hiding a page on the site needs the publish permission. */
create or replace function private.site_page_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.published) or (tg_op = 'UPDATE' and new.published is distinct from old.published) then
    if not private.can('publish') then
      raise exception 'publish_permission' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
revoke execute on function private.site_page_touch() from public, anon, authenticated;
create trigger site_pages_touch before insert or update on public.site_pages
  for each row execute function private.site_page_touch();

/** Public: a published page. */
create or replace function public.site_page(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('slug', p.slug, 'title', jsonb_build_object('ar', p.title_ar, 'en', p.title_en),
           'description', jsonb_build_object('ar', p.description_ar, 'en', p.description_en),
           'accent', p.accent, 'blocks', p.blocks, 'settings', p.settings, 'updated_at', p.updated_at)
    from public.site_pages p
   where p.slug = lower(btrim(p_slug)) and p.published and not p.archived
$$;
revoke execute on function public.site_page(text) from public;
grant execute on function public.site_page(text) to anon, authenticated;
