-- Baqloz's AI: spending guard and savings.
--   * An on/off switch and limits the team sets from the BuildX App (site_settings 'guide_ai'):
--     per visitor every 10 minutes, per visitor a day, and for the whole site a day.
--   * An answer cache: the same first question within 6 hours is answered once (one row per
--     distinct question, refreshed in place, so it stays small).
--   * Daily usage (calls, tokens, cache hits) the team can watch in the app.
-- guide_chat_allow is replaced in place (same signature); nothing is dropped.

insert into public.site_settings (key, value)
values ('guide_ai', '{"enabled": true, "per_ip_10min": 6, "per_ip_day": 25, "site_day": 300}')
on conflict (key) do nothing;

create table private.guide_usage (
  day date primary key default (now() at time zone 'Africa/Cairo')::date,
  calls int not null default 0,
  cache_hits int not null default 0,
  refused int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0
);

create table private.guide_answer_cache (
  key text primary key check (char_length(key) = 64),
  answer text not null check (char_length(answer) <= 4000),
  hits int not null default 0,
  created_at timestamptz not null default now()
);
create index guide_answer_cache_created_idx on private.guide_answer_cache (created_at);

/** May this visitor ask the AI now? Off switch and limits from site_settings 'guide_ai'. */
create or replace function public.guide_chat_allow(p_ip text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := coalesce((select value from public.site_settings where key = 'guide_ai'), '{}');
  ok boolean;
begin
  if coalesce((v ->> 'enabled')::boolean, true) is false then
    return false;
  end if;
  ok := private.throttle_ip('guide_ai', p_ip, least(greatest(coalesce((v ->> 'per_ip_10min')::int, 6), 1), 50), interval '10 minutes')
    and private.throttle_ip('guide_ai_ip_day', p_ip, least(greatest(coalesce((v ->> 'per_ip_day')::int, 25), 1), 500), interval '1 day')
    and private.throttle_ip('guide_ai_day', 'site', least(greatest(coalesce((v ->> 'site_day')::int, 300), 1), 20000), interval '1 day');
  if not ok then
    insert into private.guide_usage as u (refused) values (1)
    on conflict (day) do update set refused = u.refused + 1;
  end if;
  return ok;
end $$;

/** A cached answer (fresh for 6 hours), counted as a hit. */
create or replace function public.guide_cache_get(p_key text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v text;
begin
  update private.guide_answer_cache set hits = hits + 1
   where key = p_key and created_at > now() - interval '6 hours'
  returning answer into v;
  if v is not null then
    insert into private.guide_usage as u (cache_hits) values (1)
    on conflict (day) do update set cache_hits = u.cache_hits + 1;
  end if;
  return v;
end $$;

create or replace function public.guide_cache_put(p_key text, p_answer text) returns void
language sql security definer set search_path = ''
as $$
  insert into private.guide_answer_cache (key, answer) values (p_key, left(p_answer, 4000))
  on conflict (key) do update set answer = excluded.answer, created_at = now(), hits = 0;
$$;

create or replace function public.guide_usage_add(p_in bigint, p_out bigint, p_cache_read bigint, p_cache_write bigint) returns void
language sql security definer set search_path = ''
as $$
  insert into private.guide_usage as u (calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
  values (1, coalesce(p_in, 0), coalesce(p_out, 0), coalesce(p_cache_read, 0), coalesce(p_cache_write, 0))
  on conflict (day) do update set
    calls = u.calls + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens;
$$;

/** The last 30 days, for owners/admins in the BuildX App. */
create or replace function public.staff_guide_usage() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(u) order by u.day desc)
      from private.guide_usage u where u.day > (now() at time zone 'Africa/Cairo')::date - 30
  ), '[]');
end $$;

revoke execute on function public.guide_chat_allow(text), public.guide_cache_get(text), public.guide_cache_put(text, text),
  public.guide_usage_add(bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.guide_chat_allow(text), public.guide_cache_get(text), public.guide_cache_put(text, text),
  public.guide_usage_add(bigint, bigint, bigint, bigint) to service_role;
revoke execute on function public.staff_guide_usage() from public, anon;
grant execute on function public.staff_guide_usage() to authenticated;
