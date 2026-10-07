Pages that exist only in the static (GitHub Pages) build. `scripts/build-static.mjs` copies each folder
here into `src/app/[locale]/`, replacing the database-backed page at the same path. They pre-render every
published member, news post, project and event from Supabase at build time.
