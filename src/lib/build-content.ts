/**
 * Published website content read while the site is built, so every member, post, project and event
 * gets its own pre-rendered page (real HTML for search engines and link previews). The browser still
 * refreshes everything live; a failed or blocked read here just means fewer pre-rendered pages.
 */
import type { ContentKind, SiteItem } from "./site-content";
import type { SiteSettings } from "./site-settings";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-public";
import { sortProfiles, type TeamProfile, type TeamProject } from "./team-public";

const PROFILE_COLS = "id,slug,full_name,full_name_ar,headline,headline_ar,bio,bio_ar,group_kind,track,photo_path,skills,links,external_url,published,sort_order";

const memo = new Map<string, Promise<unknown[]>>();

function rows<T>(query: string): Promise<T[]> {
  if (!memo.has(query))
    memo.set(
      query,
      fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "force-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<unknown[]>) : []))
        .catch(() => []),
    );
  return memo.get(query) as Promise<T[]>;
}

export async function buildTeam(): Promise<TeamProfile[]> {
  return sortProfiles(await rows<TeamProfile>(`team_profiles?select=${PROFILE_COLS}&published=eq.true`));
}

/** Members whose portfolio lives on this site (external portfolios link out instead). */
export async function buildMembers(): Promise<TeamProfile[]> {
  return (await buildTeam()).filter((p) => !p.external_url);
}

export async function buildMember(slug: string): Promise<{ profile: TeamProfile; projects: TeamProject[] } | null> {
  const profile = (await buildMembers()).find((p) => p.slug === slug);
  if (!profile) return null;
  const projects = await rows<TeamProject>(`team_projects?select=*&profile_id=eq.${profile.id}&order=sort_order.asc,created_at.desc`);
  return { profile, projects };
}

const ORDER: Record<ContentKind, string> = {
  event: "starts_at.desc.nullslast",
  post: "pinned.desc,created_at.desc",
  project: "pinned.desc,sort_order.asc,created_at.desc",
  photo: "starts_at.desc.nullslast,created_at.desc",
  achievement: "starts_at.desc.nullslast,created_at.desc",
  faq: "sort_order.asc,created_at.asc",
  testimonial: "pinned.desc,sort_order.asc,created_at.desc",
  partner: "sort_order.asc,created_at.asc",
  story: "pinned.desc,sort_order.asc,created_at.desc",
};

export function buildItems(kind: ContentKind): Promise<SiteItem[]> {
  return rows<SiteItem>(`site_content?select=*&published=eq.true&kind=eq.${kind}&order=${ORDER[kind]}&limit=500`);
}

/** Items that get their own page: news posts, projects and events with a slug. */
export async function buildPages(kind: "post" | "project" | "event"): Promise<SiteItem[]> {
  return (await buildItems(kind)).filter((i) => i.slug);
}

export async function buildItem(kind: "post" | "project" | "event", slug: string): Promise<SiteItem | null> {
  return (await buildPages(kind)).find((i) => i.slug === slug) ?? null;
}

/** generateStaticParams for a [slug] page. A static export needs at least one path, so an empty list
 * gets a placeholder that renders the not-found page. */
export const PLACEHOLDER = "_";
export const slugParams = (slugs: string[]) => (slugs.length ? slugs : [PLACEHOLDER]).map((slug) => ({ slug }));

/** The owner's website settings (BuildX App → Site settings). */
export async function buildSiteSettings(): Promise<SiteSettings | null> {
  const [row] = await rows<{ value: SiteSettings }>("site_settings?select=value&key=eq.site");
  return row?.value ?? null;
}
