import type { MetadataRoute } from "next";
import { buildMembers, buildPages } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { SITE_URL } from "@/lib/seo";
import { getArticles, getEvents, getGallery, getProjects, getPublicMembers, getTeams, getTracks } from "@/server/queries/public";

export const revalidate = 3600;

const PAGES = ["", "/about", "/tracks", "/projects", "/competitions", "/bootcamp", "/team", "/achievements", "/events", "/gallery", "/films", "/sponsors", "/join", "/join/status", "/faq", "/verify", "/contact", "/news", "/resources", "/brand", "/privacy"];

/** Both locales for every public URL, with hreflang alternates. Private routes are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The static export serves every page as a folder (/about/), so list the final URL, not a redirect.
  const slash = (p: string) => (STATIC_SITE && !p.endsWith("/") ? `${p}/` : p);
  const entry = (path: string, lastModified?: Date | string | null, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${slash(path || "/")}`,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: { en: `${SITE_URL}${slash(path || "/")}`, ar: `${SITE_URL}${slash(`/ar${path}`)}` } },
  });
  const safe = async <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  if (STATIC_SITE) {
    // The static site lists the pages it pre-rendered from the content published in the BuildX App.
    const [tracks, teams, members, posts, projects, events] = await Promise.all([getTracks(), getTeams(), buildMembers(), buildPages("post"), buildPages("project"), buildPages("event")]);
    return [
      ...PAGES.map((p) => entry(p, null, p === "" ? 1 : 0.7)),
      ...tracks.map((t) => entry(`/tracks/${t.slug}`)),
      ...teams.map((t) => entry(`/competitions/${t.slug}`)),
      ...members.map((m) => entry(`/team/${m.slug}`, null, 0.5)),
      ...posts.map((i) => entry(`/news/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
      ...projects.map((i) => entry(`/projects/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
      ...events.map((i) => entry(`/events/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
    ];
  }
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
