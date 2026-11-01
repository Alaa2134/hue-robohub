/** Website content the team publishes from the app (events, news, projects, gallery, achievements). */
import { publicGet } from "./public-cache";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-public";

export type ContentKind =
  "event" | "post" | "project" | "photo" | "achievement" | "faq" | "testimonial" | "partner" | "story";

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
  updated_at?: string;
  publish_at?: string | null;
  rsvp_open?: boolean;
  capacity?: number | null;
  created_by?: string | null;
};

/** Photos uploaded since the WebP pipeline have a small `.t.` copy beside the main `.w.` one. */
export const thumbOf = (path: string) => path.replace(/\.w\.(webp|jpg)$/, ".t.$1");
export const publicImageUrl = (bucket: string, path: string, size: "full" | "thumb" = "full") =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${(size === "thumb" ? thumbOf(path) : path).split("/").map(encodeURIComponent).join("/")}`;
/** A content picture: uploaded to the "site" bucket, or a file shipped with the site ("/media/…", same `.w.`/`.t.` naming). */
export const siteImageUrl = (path: string, size: "full" | "thumb" = "full") =>
  path.startsWith("/")
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${size === "thumb" ? thumbOf(path) : path}`
    : publicImageUrl("site", path, size);

type Loc = "en" | "ar" | string;
export const pickL = (en: string | null | undefined, ar: string | null | undefined, locale: Loc) =>
  (locale === "ar" && ar ? ar : en) || ar || "";
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
  faq: "sort_order.asc,created_at.asc",
  testimonial: "pinned.desc,sort_order.asc,created_at.desc",
  partner: "sort_order.asc,created_at.asc",
  story: "pinned.desc,sort_order.asc,created_at.desc",
};

async function rest<T>(q: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: SUPABASE_KEY, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`content_${res.status}`);
  return (await res.json()) as T;
}

/** Published items of one kind, newest/soonest first (kept in the tab for a few minutes). */
export function fetchContent(kind: ContentKind, limit = 200): Promise<SiteItem[]> {
  return publicGet<SiteItem[]>(
    `site_content?select=*&published=eq.true&kind=eq.${kind}&order=${ORDER[kind]}&limit=${limit}`,
  );
}

export async function fetchItem(kind: ContentKind, slug: string): Promise<SiteItem | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const [row] = await publicGet<SiteItem[]>(
    `site_content?select=*&published=eq.true&kind=eq.${kind}&slug=eq.${slug}&limit=1`,
  );
  return row ?? null;
}

/** Upcoming events (still running or later), soonest first. */
export async function fetchUpcoming(limit = 6): Promise<SiteItem[]> {
  // Rounded to 10 minutes so pages opened close together share one cached read.
  const since = new Date(Math.floor((Date.now() - 6 * 3600_000) / 600_000) * 600_000).toISOString();
  return publicGet<SiteItem[]>(
    `site_content?select=*&published=eq.true&kind=eq.event&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc&limit=${limit}`,
  );
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

export type SearchHit = {
  type: "member" | "project" | "event" | "article" | "achievement";
  title: string;
  subtitle: string;
  href: string;
};

type SearchRow = {
  type: "content" | "member";
  kind: ContentKind | null;
  slug: string | null;
  title: string;
  title_ar: string | null;
  summary: string | null;
  summary_ar: string | null;
  starts_at: string | null;
  external_url: string | null;
};

/**
 * Site search over published content and portfolios, forgiving like people type (public.search_site:
 * unified Arabic letters, words with or without long vowels, small typos, Arabic ↔ English names).
 * Falls back to the plain search if that function can't be reached.
 */
export async function searchLive(term: string, locale: Loc, limit = 6): Promise<SearchHit[]> {
  const q = term.trim().slice(0, 80);
  if (q.length < 2) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_site`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_q: q, p_limit: limit * 2 }),
    });
    if (!res.ok) throw new Error(`search_${res.status}`);
    const rows = (await res.json()) as SearchRow[];
    const SECTION: Record<ContentKind, string> = {
      post: "/news",
      project: "/projects",
      event: "/events",
      achievement: "/achievements",
      photo: "/gallery",
      faq: "/faq",
      testimonial: "/",
      partner: "/sponsors",
      story: "/stories",
    };
    const TYPE: Record<ContentKind, SearchHit["type"]> = {
      post: "article",
      project: "project",
      event: "event",
      achievement: "achievement",
      photo: "article",
      faq: "article",
      testimonial: "article",
      partner: "article",
      story: "article",
    };
    return rows.map((r) =>
      r.type === "member" || !r.kind
        ? {
            type: "member" as const,
            title: pickL(r.title, r.title_ar, locale),
            subtitle: pickL(r.summary ?? "", r.summary_ar, locale),
            href: safeLink(r.external_url) ?? `/team/${r.slug}`,
          }
        : {
            type: TYPE[r.kind],
            title: pickL(r.title, r.title_ar, locale),
            subtitle:
              r.kind === "event"
                ? fmtDate(r.starts_at, locale)
                : pickL(r.summary ?? "", r.summary_ar, locale),
            href:
              r.slug && ["post", "project", "event"].includes(r.kind)
                ? `${SECTION[r.kind]}/${r.slug}`
                : SECTION[r.kind],
          },
    );
  } catch {
    return searchPlain(term, locale, limit);
  }
}

async function searchPlain(term: string, locale: Loc, limit = 6): Promise<SearchHit[]> {
  // PostgREST filter syntax: drop the characters that structure it, then URL-encode the rest.
  const q = term
    .replace(/[,()*:%\\"'.]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (q.length < 2) return [];
  const like = encodeURIComponent(`*${q}*`);
  const or = (cols: string[]) => `or=(${cols.map((c) => `${c}.ilike.${like}`).join(",")})`;
  const [items, people] = await Promise.all([
    rest<SiteItem[]>(
      `site_content?select=id,kind,slug,title,title_ar,summary,summary_ar,starts_at,created_at&published=eq.true&kind=not.in.(photo,testimonial,partner)&${or(["title", "title_ar", "summary", "summary_ar"])}&order=created_at.desc&limit=${limit * 2}`,
    ),
    rest<
      {
        slug: string;
        full_name: string;
        full_name_ar: string | null;
        headline: string;
        headline_ar: string | null;
        external_url: string | null;
      }[]
    >(
      `team_profiles?select=slug,full_name,full_name_ar,headline,headline_ar,external_url&published=eq.true&${or(["full_name", "full_name_ar", "headline", "headline_ar"])}&limit=${limit}`,
    ),
  ]);
  const SECTION: Record<ContentKind, string> = {
    post: "/news",
    project: "/projects",
    event: "/events",
    achievement: "/achievements",
    photo: "/gallery",
    faq: "/faq",
    testimonial: "/",
    partner: "/sponsors",
    story: "/stories",
  };
  const TYPE: Record<ContentKind, SearchHit["type"]> = {
    post: "article",
    project: "project",
    event: "event",
    achievement: "achievement",
    photo: "article",
    faq: "article",
    testimonial: "article",
    partner: "article",
    story: "article",
  };
  return [
    ...people.map((p) => ({
      type: "member" as const,
      title: pickL(p.full_name, p.full_name_ar, locale),
      subtitle: pickL(p.headline, p.headline_ar, locale),
      href: safeLink(p.external_url) ?? `/team/${p.slug}`,
    })),
    ...items.map((i) => ({
      type: TYPE[i.kind],
      title: titleOf(i, locale),
      subtitle: i.kind === "event" ? fmtDate(i.starts_at, locale) : summaryOf(i, locale),
      href:
        i.slug && ["post", "project", "event"].includes(i.kind)
          ? `${SECTION[i.kind]}/${i.slug}`
          : SECTION[i.kind],
    })),
  ].slice(0, limit * 2);
}
