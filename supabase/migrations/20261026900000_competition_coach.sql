-- Competition Coach: the rules of each competition as numbered sections, searchable by anyone, and
-- an optional AI answer that may use only the sections the search found and must cite them by
-- number (the coach-ask Edge Function checks every citation against those sections and drops the
-- answer if none holds). The search costs nothing; the AI is off until the team turns it on
-- (site_settings 'coach_ai') and shares the guide's limits and daily cap. Answers are cached.

create table if not exists public.rule_books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  title_en text check (char_length(title_en) <= 140),
  competition text not null default '' check (char_length(competition) <= 80),
  edition text not null default '' check (char_length(edition) <= 40),
  source_url text check (source_url is null or (source_url ~* '^https://[^[:space:]]+$' and char_length(source_url) <= 400)),
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists rule_books_created_by on public.rule_books (created_by);

create table if not exists public.rule_sections (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.rule_books(id) on delete cascade,
  position int not null,
  ref text not null check (char_length(btrim(ref)) between 1 and 40),
  heading text not null default '' check (char_length(heading) <= 200),
  body text not null default '' check (char_length(body) <= 8000),
  fts tsvector generated always as (to_tsvector('simple', ref || ' ' || heading || ' ' || body)) stored
);
create index if not exists rule_sections_book on public.rule_sections (book_id, position);
create index if not exists rule_sections_fts on public.rule_sections using gin (fts);

create table if not exists private.coach_cache (
  key text primary key,
  answer jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.rule_books enable row level security;
alter table public.rule_sections enable row level security;
revoke all on public.rule_books, public.rule_sections from anon, authenticated;

/** Published rule books. */
create or replace function public.rulebooks_public()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'title', b.title, 'title_en', b.title_en, 'competition', b.competition, 'edition', b.edition,
                                               'source_url', b.source_url, 'sections', (select count(*) from public.rule_sections s where s.book_id = b.id),
                                               'ai', coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'coach_ai'), false))
                            order by b.competition, b.title), '[]')
    from public.rule_books b where b.published
$$;

/** The sections that best match a question (full-text first, then any-word), with their full text. */
create or replace function private.coach_passages(p_book text, p_q text, p_limit int default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_book uuid;
  v_q text := left(btrim(coalesce(p_q, '')), 300);
  v_out jsonb;
begin
  select id into v_book from public.rule_books where slug = p_book and published;
  if v_book is null or v_q = '' then return '[]'; end if;
  select jsonb_agg(x.j order by x.rank desc, x.position) into v_out from (
    select s.position, ts_rank(s.fts, q) as rank,
           jsonb_build_object('ref', s.ref, 'heading', s.heading, 'body', s.body,
                              'snippet', ts_headline('simple', s.body, q, 'MaxWords=40, MinWords=15, StartSel=«, StopSel=»')) as j
      from public.rule_sections s, websearch_to_tsquery('simple', v_q) q
     where s.book_id = v_book and s.fts @@ q
     order by ts_rank(s.fts, q) desc, s.position limit p_limit) x;
  if v_out is null then
    -- No section has every word: any section with any of the longer words.
    select jsonb_agg(x.j order by x.hits desc, x.position) into v_out from (
      select s.position, count(*) as hits,
             jsonb_build_object('ref', s.ref, 'heading', s.heading, 'body', s.body, 'snippet', left(s.body, 240)) as j
        from public.rule_sections s
        join lateral (select w from regexp_split_to_table(lower(v_q), '[^[:alnum:]]+') w where char_length(w) >= 3) words on true
       where s.book_id = v_book and lower(s.heading || ' ' || s.body) like '%' || words.w || '%'
       group by s.id, s.position, s.ref, s.heading, s.body
       order by count(*) desc, s.position limit p_limit) x;
  end if;
  return coalesce(v_out, '[]');
end $$;

/** Anyone: search a rule book (no AI, no cost). */
create or replace function public.coach_search(p_book text, p_q text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.throttle('coach_search', 120, interval '10 minutes') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  return jsonb_build_object('ok', true, 'sections', (select coalesce(jsonb_agg(x - 'body' || jsonb_build_object('body', left(x->>'body', 2000))), '[]')
                                                        from jsonb_array_elements(private.coach_passages(p_book, p_q)) x));
end $$;

/** One section in full (to open a citation). */
create or replace function public.coach_section(p_book text, p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ref', s.ref, 'heading', s.heading, 'body', s.body)
    from public.rule_sections s join public.rule_books b on b.id = s.book_id
   where b.slug = p_book and b.published and s.ref = p_ref
   limit 1
$$;

/* ─── For the coach-ask Edge Function (service role only) ─────────────── */

create or replace function public.coach_ai_allow(p_ip text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'coach_ai'), false) then return false; end if;
  return public.guide_chat_allow(p_ip);
end $$;

create or replace function public.coach_ai_context(p_book text, p_q text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('passages', private.coach_passages(p_book, p_q, 6),
                            'book', (select jsonb_build_object('title', b.title, 'competition', b.competition, 'edition', b.edition, 'updated_at', b.updated_at)
                                       from public.rule_books b where b.slug = p_book and b.published))
$$;

create or replace function public.coach_cache_get(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select answer from private.coach_cache where key = p_key and created_at > now() - interval '7 days'
$$;

create or replace function public.coach_cache_put(p_key text, p_answer jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into private.coach_cache (key, answer) values (p_key, p_answer)
  on conflict (key) do update set answer = excluded.answer, created_at = now()
$$;

/* ─── Team ─────────────────────────────────────────────────────────────── */

create or replace function public.staff_rulebooks()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read('materials') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ai', coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'coach_ai'), false),
    'books', coalesce((select jsonb_agg(to_jsonb(b) - 'created_by' || jsonb_build_object(
                         'sections', coalesce((select jsonb_agg(jsonb_build_object('ref', s.ref, 'heading', s.heading, 'body', s.body) order by s.position)
                                                 from public.rule_sections s where s.book_id = b.id), '[]'))
                       order by b.updated_at desc) from public.rule_books b), '[]'));
end $$;

/** Save a rule book and replace its sections (the text is split into sections in the app). */
create or replace function public.staff_rulebook_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  x jsonb;
  i int := 0;
begin
  if not private.can('materials') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p->'sections') <> 'array' or jsonb_array_length(p->'sections') = 0 or jsonb_array_length(p->'sections') > 600 then
    return jsonb_build_object('ok', false, 'error', 'sections');
  end if;
  if v_id is null then
    insert into public.rule_books (slug, title, title_en, competition, edition, source_url, published)
    values (p->>'slug', p->>'title', nullif(p->>'title_en', ''), coalesce(p->>'competition', ''), coalesce(p->>'edition', ''), nullif(p->>'source_url', ''),
            coalesce((p->>'published')::boolean, false))
    returning id into v_id;
  else
    update public.rule_books set slug = p->>'slug', title = p->>'title', title_en = nullif(p->>'title_en', ''), competition = coalesce(p->>'competition', ''),
           edition = coalesce(p->>'edition', ''), source_url = nullif(p->>'source_url', ''), published = coalesce((p->>'published')::boolean, false), updated_at = now()
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    delete from public.rule_sections where book_id = v_id;
  end if;
  for x in select * from jsonb_array_elements(p->'sections') loop
    i := i + 1;
    insert into public.rule_sections (book_id, position, ref, heading, body)
    values (v_id, i, left(btrim(x->>'ref'), 40), left(coalesce(x->>'heading', ''), 200), left(coalesce(x->>'body', ''), 8000));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.staff_coach_ai(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.can('settings') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.site_settings (key, value) values ('coach_ai', jsonb_build_object('enabled', p_enabled))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function private.coach_passages(text, text, int) from public, anon, authenticated;
revoke all on function public.rulebooks_public(), public.coach_search(text, text), public.coach_section(text, text), public.coach_ai_allow(text),
  public.coach_ai_context(text, text), public.coach_cache_get(text), public.coach_cache_put(text, jsonb), public.staff_rulebooks(),
  public.staff_rulebook_save(jsonb), public.staff_coach_ai(boolean) from public;
grant execute on function public.rulebooks_public(), public.coach_search(text, text), public.coach_section(text, text) to anon, authenticated;
grant execute on function public.coach_ai_allow(text), public.coach_ai_context(text, text), public.coach_cache_get(text), public.coach_cache_put(text, jsonb) to service_role;
grant execute on function public.staff_rulebooks(), public.staff_rulebook_save(jsonb), public.staff_coach_ai(boolean) to authenticated;
