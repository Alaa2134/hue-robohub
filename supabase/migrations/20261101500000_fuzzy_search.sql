-- Site search that understands how people type: Arabic letters unified (أ إ آ ا، ى ي، ة ه، ؤ و، ئ ي),
-- no diacritics, Arabic-Indic digits, words written with or without their long vowels (روبت، ربوت،
-- روبوت), small typos (trigram similarity), and Arabic/English names of the same thing (روبوت ↔ robot).
create extension if not exists pg_trgm with schema extensions;

create or replace function private.ar_norm(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(regexp_replace(coalesce(p, ''), '[ًٌٍَُِّْٰـ]', '', 'g')),
              'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩', 'اااايهوي0123456789'),
    '\s+', ' ', 'g'))
$$;

/** The consonant skeleton: long vowels inside a word dropped (روبوت، روبت، ربوت → ربت; robot, robt → rbt). */
create or replace function private.ar_skel(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(private.ar_norm(p), '\Y[اويaeiou]', '', 'g')
$$;

/** The same word in the other language, for the names people search most. */
create or replace function private.search_terms(p text)
returns text[] language sql immutable set search_path = '' as $$
  with d(a, e) as (values
    ('روبوت', 'robot'), ('روبوتات', 'robotics'), ('روبوتكس', 'robotics'), ('اردوينو', 'arduino'), ('مسابقه', 'competition'),
    ('مسابقات', 'competitions'), ('ورشه', 'workshop'), ('ورش', 'workshops'), ('حساس', 'sensor'), ('حساسات', 'sensors'),
    ('برمجه', 'programming'), ('الكترونيات', 'electronics'), ('ذكاء اصطناعي', 'ai'), ('معرض', 'expo'), ('فعاليه', 'event'),
    ('فعاليات', 'events'), ('مشروع', 'project'), ('مشاريع', 'projects'), ('شهاده', 'certificate'), ('طباعه', 'printing'),
    ('ثري دي', '3d'), ('موتور', 'motor'), ('سومو', 'sumo'), ('لاين فولور', 'line follower'), ('بوتكامب', 'bootcamp'),
    ('امبيدد', 'embedded'), ('امبدد', 'embedded'), ('سنسور', 'sensor'), ('سنسورز', 'sensors'), ('رعايه', 'sponsorship'), ('راعي', 'sponsor'), ('انضمام', 'join'), ('فريق', 'team'), ('اخبار', 'news'), ('روبوتكس', 'robotex'))
  select array_remove(array[private.ar_norm(p)]
    || array(select e from d where private.ar_norm(p) like '%' || a || '%')
    || array(select a from d where private.ar_norm(p) like '%' || e || '%'), null)
$$;

/** Search the published site: content (news, projects, events, achievements, stories) and team profiles. */
create or replace function public.search_site(p_q text, p_limit int default 12)
returns table (type text, kind text, slug text, title text, title_ar text, summary text, summary_ar text, starts_at timestamptz,
               external_url text, score real)
language sql stable security definer set search_path = '' as $$
  with q as (
    select t as term, private.ar_skel(t) as skel
      from unnest(private.search_terms(left(p_q, 80))) t
     where char_length(btrim(t)) >= 2
  ), docs as (
    select 'content'::text as type, c.kind, c.slug, c.title, c.title_ar, c.summary, c.summary_ar, c.starts_at, null::text as external_url,
           private.ar_norm(concat_ws(' ', c.title, c.title_ar)) as head,
           private.ar_norm(concat_ws(' ', c.title, c.title_ar, c.summary, c.summary_ar, array_to_string(c.tags, ' '))) as body
      from public.site_content c
     where c.published and c.kind not in ('photo', 'testimonial', 'partner') and (c.publish_at is null or c.publish_at <= now())
    union all
    select 'member', null, p.slug, p.full_name, p.full_name_ar, p.headline, p.headline_ar, null, p.external_url,
           private.ar_norm(concat_ws(' ', p.full_name, p.full_name_ar)),
           private.ar_norm(concat_ws(' ', p.full_name, p.full_name_ar, p.headline, p.headline_ar))
      from public.team_profiles p
     where p.published
  ), scored as (
    select d.*, (
      select max(
        case when d.head like '%' || q.term || '%' then 3.0
             when d.body like '%' || q.term || '%' then 2.0
             when private.ar_skel(d.body) like '%' || q.skel || '%' and char_length(q.skel) >= 2 then 1.6
             else extensions.word_similarity(q.term, d.body) * 1.5 end)
        from q) as s
      from docs d
  )
  select type, kind, slug, title, title_ar, summary, summary_ar, starts_at, external_url, s::real
    from scored
   where s >= 0.75
   order by s desc, starts_at desc nulls last
   limit greatest(1, least(p_limit, 30))
$$;
revoke all on function public.search_site(text, int) from public;
grant execute on function public.search_site(text, int) to anon, authenticated;
