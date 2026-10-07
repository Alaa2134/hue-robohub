-- BuildX HUE — index the foreign key the database advisor flagged.
create index if not exists site_settings_updated_by_idx on public.site_settings (updated_by);
