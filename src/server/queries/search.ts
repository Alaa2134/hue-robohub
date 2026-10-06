import "server-only";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { TAGS } from "@/lib/cache-tags";

export type SearchHit = { type: "member" | "project" | "event" | "article" | "resource"; title: string; subtitle: string; href: string; rank: number };

/** Turn free text into a safe prefix tsquery: "ros nav" → "ros:* & nav:*". Only letters/digits survive. */
export function toPrefixQuery(q: string): string | null {
  const tokens = q
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 1)
    .slice(0, 6);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/**
 * Site-wide public search over indexed tsvector columns (GIN). Only public rows are searchable:
 * public member profiles, published projects, public events, published articles and resources.
 */
export const searchPublic = unstable_cache(
  async (q: string): Promise<SearchHit[]> => {
    const tsq = toPrefixQuery(q);
    if (!tsq) return [];
    const rows = await db.execute<SearchHit>(sql`
      with query as (select to_tsquery('simple', ${tsq}) as q)
      (select 'member' as type, full_name as title, coalesce(title, '') as subtitle, '/team/' || slug as href, ts_rank(search, q) as rank
        from members, query where public_profile and status <> 'inactive' and search @@ q order by rank desc limit 8)
      union all
      (select 'project', title, summary, '/projects/' || slug, ts_rank(search, q) from projects, query
        where published and search @@ q order by 5 desc limit 8)
      union all
      (select 'event', title, coalesce(location, ''), '/events/' || slug, ts_rank(search, q) from events, query
        where public and search @@ q order by 5 desc limit 8)
      union all
      (select 'article', title, excerpt, '/news/' || slug, ts_rank(search, q) from articles, query
        where published_at is not null and published_at <= now() and search @@ q order by 5 desc limit 8)
      union all
      (select 'resource', title, description, url, ts_rank(search, q) from resources, query
        where published and search @@ q order by 5 desc limit 8)
      order by rank desc
      limit 30`);
    return [...rows].map((r) => ({ ...r, rank: Number(r.rank) }));
  },
  ["search-public"],
  { tags: [TAGS.members, TAGS.projects, TAGS.events, TAGS.articles, TAGS.resources], revalidate: 300 },
);
