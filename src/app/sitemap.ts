import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { getArticles, getEvents, getGallery, getProjects, getPublicMembers, getTeams, getTracks } from "@/server/queries/public";

export const revalidate = 3600;

const PAGES = ["", "/about", "/tracks", "/projects", "/competitions", "/bootcamp", "/team", "/achievements", "/events", "/gallery", "/films", "/sponsors", "/join", "/contact", "/news", "/resources", "/brand", "/privacy"];

/** Both locales for every public URL, with hreflang alternates. Private routes are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entry = (path: string, lastModified?: Date | string | null, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: { en: `${SITE_URL}${path || "/"}`, ar: `${SITE_URL}/ar${path}` } },
  });
  const safe = async <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [tracks, teams, projects, members, events, gallery, articles] = await Promise.all([
    safe(getTracks(), []),
    safe(getTeams(), []),
    safe(getProjects(), []),
    safe(getPublicMembers(), []),
    safe(getEvents(), { upcoming: [], past: [] }),
    safe(getGallery(), { albums: [], items: [] }),
    safe(getArticles(), []),
  ]);
  return [
    ...PAGES.map((p) => entry(p, null, p === "" ? 1 : 0.7)),
    ...tracks.map((t) => entry(`/tracks/${t.slug}`)),
    ...teams.map((t) => entry(`/competitions/${t.slug}`)),
    ...projects.map((p) => entry(`/projects/${p.slug}`)),
    ...members.map((m) => entry(`/team/${m.slug}`, null, 0.4)),
    ...[...events.upcoming, ...events.past].map((e) => entry(`/events/${e.slug}`, null, 0.5)),
    ...gallery.albums.map((a) => entry(`/gallery/${a.slug}`, null, 0.4)),
    ...(articles as { slug: string; kind?: string }[]).map((a) => entry(`/news/${a.slug}`, null, 0.5)),
  ];
}
