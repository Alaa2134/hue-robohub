-- The public Skill Passport shows the student's badges too (only tiers they reached, from their own
-- records), so the one link they put on their CV / LinkedIn carries everything.
select private.patch_function('private.passport_data(uuid)',
  $f$'numbers', jsonb_build_object($f$,
  $f$'badges', coalesce((
      select jsonb_agg(jsonb_build_object('key', a.key, 'tier', a.tier, 'th', to_jsonb(a.th)) order by a.ord)
        from private.achievements_compute(s.id) a where a.tier > 0), '[]'),
    'numbers', jsonb_build_object($f$);
