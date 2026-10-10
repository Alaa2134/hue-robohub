-- Page builder: every save keeps the version before it (the editor lists the last 30 and brings any of
-- them back), and a page can go up and come down by itself ("publish_at" / "unpublish_at", e.g. an expo
-- page that shows on the 1st and hides after the visit). Setting either time needs the publish permission.

alter table public.site_pages
  add column if not exists publish_at timestamptz,
  add column if not exists unpublish_at timestamptz;

create table if not exists public.site_page_versions (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.site_pages (id) on update cascade,
  title_ar text not null,
  title_en text,
  description_ar text,
  description_en text,
  accent text not null,
  blocks jsonb not null,
  settings jsonb not null,
  saved_by uuid,
  saved_at timestamptz not null
);
create index if not exists site_page_versions_page_idx on public.site_page_versions (page_id, saved_at desc);
alter table public.site_page_versions enable row level security;
create policy site_page_versions_select on public.site_page_versions for select to authenticated
  using ((select private.can_read('pages')));
revoke all on public.site_page_versions from anon;
grant select on public.site_page_versions to authenticated;

/** Before a page's content changes: keep what it was (who saved it and when). */
create or replace function private.site_page_keep() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (old.blocks, old.settings, old.title_ar, old.title_en, old.description_ar, old.description_en, old.accent)
     is distinct from (new.blocks, new.settings, new.title_ar, new.title_en, new.description_ar, new.description_en, new.accent) then
    insert into public.site_page_versions (page_id, title_ar, title_en, description_ar, description_en, accent, blocks, settings, saved_by, saved_at)
    values (old.id, old.title_ar, old.title_en, old.description_ar, old.description_en, old.accent, old.blocks, old.settings, old.updated_by, old.updated_at);
  end if;
  return new;
end $$;
revoke execute on function private.site_page_keep() from public, anon, authenticated;
create or replace trigger site_pages_keep before update on public.site_pages
  for each row execute function private.site_page_keep();

-- Scheduling who shows the page is publishing too.
select private.patch_function('private.site_page_touch()',
  $p$  if (tg_op = 'INSERT' and new.published) or (tg_op = 'UPDATE' and new.published is distinct from old.published) then$p$,
  $p$  if (tg_op = 'INSERT' and (new.published or new.publish_at is not null or new.unpublish_at is not null))
     or (tg_op = 'UPDATE' and (new.published is distinct from old.published or new.publish_at is distinct from old.publish_at
                               or new.unpublish_at is distinct from old.unpublish_at)) then$p$);

/** Public: a page that is up now (published or its time came, and not past its end). */
create or replace function public.site_page(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('slug', p.slug, 'title', jsonb_build_object('ar', p.title_ar, 'en', p.title_en),
           'description', jsonb_build_object('ar', p.description_ar, 'en', p.description_en),
           'accent', p.accent, 'blocks', p.blocks, 'settings', p.settings, 'updated_at', p.updated_at)
    from public.site_pages p
   where p.slug = lower(btrim(p_slug)) and not p.archived
     and (p.published or (p.publish_at is not null and p.publish_at <= now()))
     and (p.unpublish_at is null or p.unpublish_at > now())
$$;
revoke execute on function public.site_page(text) from public;
grant execute on function public.site_page(text) to anon, authenticated;
