/** Website content the team publishes from the app (events, news, projects, gallery, achievements). */
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-public";

export type ContentKind = "event" | "post" | "project" | "photo" | "achievement";

export type SiteItem = {
  id: string;
  kind: ContentKind;
  slug: string | null;
  title: string;
  title_ar: string | null;
  summary: string | null;
  summary_ar: string | null;
  body: string | null;
  body_ar: string | null;
  result: string | null;
  result_ar: string | null;
  image_path: string | null;
  url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  location_ar: string | null;
  track: string | null;
  tags: string[];
  published: boolean;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  created_by?: string | null;
};

export const siteImageUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/site/${path.split("/").map(encodeURIComponent).join("/")}`;

type Loc = "en" | "ar" | string;
export const pickL = (en: string | null | undefined, ar: string | null | undefined, locale: Loc) => (locale === "ar" && ar ? ar : en) || ar || "";
export const titleOf = (i: SiteItem, l: Loc) => pickL(i.title, i.title_ar, l);
export const summaryOf = (i: SiteItem, l: Loc) => pickL(i.summary, i.summary_ar, l);
export const bodyOf = (i: SiteItem, l: Loc) => pickL(i.body, i.body_ar, l);
export const resultOf = (i: SiteItem, l: Loc) => pickL(i.result, i.result_ar, l);
export const locationOf = (i: SiteItem, l: Loc) => pickL(i.location, i.location_ar, l);
export const safeLink = (u: string | null | undefined) => (u && /^https?:\/\/[^\s]+$/i.test(u) ? u : null);

const ORDER: Record<ContentKind, string> = {
  event: "starts_at.asc.nullslast",
  post: "pinned.desc,created_at.desc",
  project: "pinned.desc,sort_order.asc,created_at.desc",
  photo: "starts_at.desc.nullslast,created_at.desc",
  achievement: "starts_at.desc.nullslast,created_at.desc",
};

async function rest<T>(q: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`content_${res.status}`);
  return (await res.json()) as T;
}

/** Published items of one kind, newest/soonest first. */
export function fetchContent(kind: ContentKind, limit = 200): Promise<SiteItem[]> {
  return rest<SiteItem[]>(`site_content?select=*&published=eq.true&kind=eq.${kind}&order=${ORDER[kind]}&limit=${limit}`);
}

export async function fetchItem(kind: ContentKind, slug: string): Promise<SiteItem | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const [row] = await rest<SiteItem[]>(`site_content?select=*&published=eq.true&kind=eq.${kind}&slug=eq.${slug}&limit=1`);
  return row ?? null;
}

/** Upcoming events (still running or later), soonest first. */
export async function fetchUpcoming(limit = 6): Promise<SiteItem[]> {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  return rest<SiteItem[]>(`site_content?select=*&published=eq.true&kind=eq.event&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc&limit=${limit}`);
}

export function fmtDate(iso: string | null | undefined, locale: Loc, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Africa/Cairo",
  }).format(d);
}
