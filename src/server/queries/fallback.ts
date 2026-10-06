import "server-only";
import { coreBootcamp, coreTeams, coreTracks } from "@/content/core-content";

/**
 * Built-in content served when no database is configured (first deploy, previews, demos).
 * Only organisation reference content — tracks, competition disciplines, the bootcamp curriculum —
 * never people, results or numbers, so the site stays honest before real records exist.
 */

const EPOCH = new Date("2026-01-01T00:00:00Z");

export function fallbackTracks() {
  return coreTracks.map((t, i) => ({
    id: `core-${t.slug}`,
    slug: t.slug,
    code: t.code,
    name: t.name,
    nameAr: t.nameAr as string | null,
    tagline: t.tagline,
    taglineAr: t.taglineAr as string | null,
    description: t.description,
    descriptionAr: t.descriptionAr as string | null,
    tools: [...t.tools],
    technologies: [...t.technologies],
    competitions: [...t.competitions],
    illustration: t.illustration,
    cover: null,
    memberCount: 0,
    projectCount: 0,
    sortOrder: i,
  }));
}

export function fallbackTrack(slug: string) {
  const i = coreTracks.findIndex((t) => t.slug === slug);
  const t = coreTracks[i];
  if (!t) return null;
  return {
    id: `core-${t.slug}`,
    slug: t.slug,
    code: t.code,
    name: t.name,
    nameAr: t.nameAr as string | null,
    tagline: t.tagline,
    taglineAr: t.taglineAr as string | null,
    description: t.description,
    descriptionAr: t.descriptionAr as string | null,
    tools: [...t.tools],
    technologies: [...t.technologies],
    competitions: [...t.competitions],
    illustration: t.illustration,
    coverId: null,
    sortOrder: i,
    published: true,
    createdAt: EPOCH.toISOString(),
    updatedAt: EPOCH.toISOString(),
    cover: null,
    roadmap: t.roadmap.map(([stage, title, description], position) => ({ id: `${t.slug}-${position}`, stage, title, description })),
    members: [],
    projects: [],
    gallery: [],
    resources: [],
  };
}

export function fallbackTeams() {
  return coreTeams.map((t) => ({
    id: `core-${t.slug}`,
    slug: t.slug,
    code: t.code,
    name: t.name,
    nameAr: t.nameAr as string | null,
    discipline: t.discipline as string,
    summary: t.summary as string,
    accent: t.accent as string,
    robotName: null as string | null,
    cover: null,
    memberCount: 0,
    achievementCount: 0,
  }));
}

export function fallbackTeamsWithSpecs() {
  return fallbackTeams().map((t) => ({ ...t, specs: (coreTeams.find((c) => c.slug === t.slug)?.specs ?? []).map(([label, value]) => ({ label, value })) }));
}

export function fallbackTeam(slug: string) {
  const t = coreTeams.find((c) => c.slug === slug);
  if (!t) return null;
  return {
    id: `core-${t.slug}`,
    slug: t.slug,
    code: t.code,
    name: t.name,
    discipline: t.discipline as string,
    summary: t.summary as string,
    description: t.description as string,
    accent: t.accent as string,
    robotName: null as string | null,
    robotDescription: null as string | null,
    cover: null,
    specs: t.specs.map(([label, value]) => ({ label, value })),
    captain: null,
    members: [],
    competitions: [],
    achievements: [],
    gallery: [],
    videos: [],
    projects: [],
    ogImage: null,
  };
}

export function fallbackBootcamp() {
  return {
    modules: coreBootcamp.map((m) => ({
      id: `week-${m.week}`,
      week: m.week,
      title: m.title,
      summary: m.summary,
      outcomes: [...m.outcomes],
      lessons: m.lessons.map((title, i) => ({ id: `week-${m.week}-${i}`, title, durationMinutes: null as number | null })),
    })),
    sessions: [],
  };
}
