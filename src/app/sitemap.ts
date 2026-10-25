import type { MetadataRoute } from "next";
import { buildEmptySections, buildMembers, buildPages } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { SITE_URL } from "@/lib/seo";
import { getArticles, getEvents, getGallery, getProjects, getPublicMembers, getTeams, getTracks } from "@/server/queries/public";

export const revalidate = 3600;

const PAGES = ["", "/about", "/tracks", "/projects", "/competitions", "/bootcamp", "/team", "/achievements", "/stories", "/events", "/robotex", "/gallery", "/films", "/sponsors", "/join", "/join/status", "/family", "/faq", "/verify", "/forms", "/contact", "/news", "/resources", "/directory", "/3dai", "/brand", "/privacy"];

/** Both locales for every public URL, with hreflang alternates. Private routes are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The static export serves every page as a folder (/about/), so list the final URL, not a redirect.
  const slash = (p: string) => (STATIC_SITE && !p.endsWith("/") ? `${p}/` : p);
  // Each page is listed once per language, and every copy names both (and English as the default),
  // so search engines index the Arabic pages too and show each reader their language.
  const entry = (path: string, lastModified?: Date | string | null, priority = 0.6): MetadataRoute.Sitemap => {
    const en = `${SITE_URL}${slash(path || "/")}`;
    const ar = `${SITE_URL}${slash(`/ar${path}`)}`;
    const alternates = { languages: { en, ar, "x-default": en } };
    const modified = lastModified ? new Date(lastModified) : undefined;
    return [
      { url: en, lastModified: modified, priority, alternates },
      { url: ar, lastModified: modified, priority, alternates },
    ];
  };
  const safe = async <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  if (STATIC_SITE) {
    // The static site lists the pages it pre-rendered from the content published in the BuildX App.
    const [tracks, teams, members, posts, projects, events, empty] = await Promise.all([getTracks(), getTeams(), buildMembers(), buildPages("post"), buildPages("project"), buildPages("event"), buildEmptySections()]);
    // A section with nothing published yet (only its title) stays out until the team publishes in it.
    const hidden = new Set(empty.map((k) => `/${k}`));
    return [
      ...PAGES.filter((p) => !hidden.has(p)).flatMap((p) => entry(p, null, p === "" ? 1 : 0.7)),
      ...tracks.flatMap((t) => entry(`/tracks/${t.slug}`)),
      ...teams.flatMap((t) => entry(`/competitions/${t.slug}`)),
      ...members.flatMap((m) => entry(`/team/${m.slug}`, null, 0.5)),
      ...posts.flatMap((i) => entry(`/news/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
      ...projects.flatMap((i) => entry(`/projects/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
      ...events.flatMap((i) => entry(`/events/${i.slug}`, i.updated_at ?? i.created_at, 0.6)),
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
    ...PAGES.flatMap((p) => entry(p, null, p === "" ? 1 : 0.7)),
    ...tracks.flatMap((t) => entry(`/tracks/${t.slug}`)),
    ...teams.flatMap((t) => entry(`/competitions/${t.slug}`)),
    ...projects.flatMap((p) => entry(`/projects/${p.slug}`)),
    ...members.flatMap((m) => entry(`/team/${m.slug}`, null, 0.4)),
    ...[...events.upcoming, ...events.past].flatMap((e) => entry(`/events/${e.slug}`, null, 0.5)),
    ...gallery.albums.flatMap((a) => entry(`/gallery/${a.slug}`, null, 0.4)),
    ...(articles as { slug: string; kind?: string }[]).flatMap((a) => entry(`/news/${a.slug}`, null, 0.5)),
  ];
}
