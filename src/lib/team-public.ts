/** Team portfolios as the website reads them (published rows only, publishable key). */
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-public";

export type TeamGroup = "founder" | "lead" | "member";
export type TeamLinks = Partial<Record<"website" | "github" | "linkedin" | "behance" | "instagram" | "x" | "youtube", string>>;
export type TeamProfile = {
  id: string;
  slug: string;
  full_name: string;
  full_name_ar: string | null;
  headline: string;
  headline_ar: string | null;
  bio: string;
  bio_ar: string | null;
  group_kind: TeamGroup;
  track: string | null;
  photo_path: string | null;
  skills: string[];
  links: TeamLinks;
  external_url: string | null;
  published: boolean;
  sort_order: number;
  /** Staff-only: the account that edits this profile (never selected by the website). */
  user_id?: string | null;
};
export type TeamProject = {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  image_path: string | null;
  url: string | null;
  tags: string[];
  year: number | null;
  sort_order: number;
};

export const LINK_KEYS = ["website", "github", "linkedin", "behance", "instagram", "x", "youtube"] as const;
export const LINK_LABEL: Record<(typeof LINK_KEYS)[number], string> = {
  website: "Website",
  github: "GitHub",
  linkedin: "LinkedIn",
  behance: "Behance",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
};

export const teamImageUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/team/${path.split("/").map(encodeURIComponent).join("/")}`;

export const nameOf = (p: Pick<TeamProfile, "full_name" | "full_name_ar">, locale: string) => (locale === "ar" && p.full_name_ar) || p.full_name;
export const headlineOf = (p: Pick<TeamProfile, "headline" | "headline_ar">, locale: string) => (locale === "ar" && p.headline_ar) || p.headline;
export const bioOf = (p: Pick<TeamProfile, "bio" | "bio_ar">, locale: string) => (locale === "ar" && p.bio_ar) || p.bio;

/** Only http(s) links are ever rendered as hrefs. */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\/[^\s]+$/i.test(u) ? u : null);

const GROUP_ORDER: Record<TeamGroup, number> = { founder: 0, lead: 1, member: 2 };
export const sortProfiles = (list: TeamProfile[]) =>
  [...list].sort((a, b) => GROUP_ORDER[a.group_kind] - GROUP_ORDER[b.group_kind] || a.sort_order - b.sort_order || a.full_name.localeCompare(b.full_name));

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`team_${res.status}`);
  return (await res.json()) as T;
}

const PROFILE_COLS = "id,slug,full_name,full_name_ar,headline,headline_ar,bio,bio_ar,group_kind,track,photo_path,skills,links,external_url,published,sort_order";

export async function fetchTeam(): Promise<TeamProfile[]> {
  return sortProfiles(await rest<TeamProfile[]>(`team_profiles?select=${PROFILE_COLS}&published=eq.true`));
}

export async function fetchMember(slug: string): Promise<{ profile: TeamProfile; projects: TeamProject[] } | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const [profile] = await rest<TeamProfile[]>(`team_profiles?select=${PROFILE_COLS}&published=eq.true&slug=eq.${slug}&limit=1`);
  if (!profile) return null;
  const projects = await rest<TeamProject[]>(`team_projects?select=*&profile_id=eq.${profile.id}&order=sort_order.asc,created_at.desc`);
  return { profile, projects };
}
