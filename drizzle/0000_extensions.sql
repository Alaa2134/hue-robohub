-- Extensions and helper functions required by the schema.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- array_to_string is STABLE; generated columns need an IMMUTABLE expression.
CREATE OR REPLACE FUNCTION rh_array_to_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;
