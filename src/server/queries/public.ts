import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, lte, ne, notInArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, schema } from "../db";
import { env, hasDatabase } from "../env";
import { coreTeams, coreTracks } from "@/content/core-content";
import { fallbackBootcamp, fallbackTeam, fallbackTeams, fallbackTeamsWithSpecs, fallbackTrack, fallbackTracks } from "./fallback";
import { presentImage, ogImageUrl } from "../media/present";
import { TAGS } from "@/lib/cache-tags";
import { defaultSiteConfig, SETTING_KEYS, type SiteConfig } from "@/lib/site-config";
import { buildSiteSettings } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { applySettings } from "@/lib/site-settings";
import type { MemberCard, PublicImage, VideoSource } from "@/lib/types";
import { resolveVideo } from "@/lib/video";
import { RANK_ORDER } from "@/lib/members";

const s = schema;
const REVALIDATE = 3600; // safety net; publishes expire tags immediately

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Cached query that serves built-in content when no database is configured (see ./fallback). */
function cached<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string[], opts: { tags: string[]; revalidate: number }, fallback: (...a: A) => R): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, key, opts);
  return (...a: A) => (hasDatabase() ? c(...a) : Promise.resolve(fallback(...a)));
}


/* ─── Assets ───────────────────────────────────────────────────────────────── */

async function loadImages(ids: Array<string | null | undefined>): Promise<Map<string, PublicImage>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, PublicImage>();
  if (!unique.length) return out;
  const rows = await db
    .select()
    .from(s.mediaAssets)
    .where(and(inArray(s.mediaAssets.id, unique), eq(s.mediaAssets.visibility, "public")));
  for (const r of rows) {
    const img = presentImage(r);
    if (img) out.set(r.id, img);
  }
  return out;
}

async function loadOg(id: string | null | undefined) {
  if (!id) return null;
  const [r] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id)).limit(1);
  return ogImageUrl(r);
}

/* ─── Settings ─────────────────────────────────────────────────────────────── */

const getSiteConfigFromDb = cached(
  async (): Promise<SiteConfig> => {
    const rows = await db.select().from(s.settings).where(inArray(s.settings.key, SETTING_KEYS));
    const merged = structuredClone(defaultSiteConfig) as Record<string, unknown>;
    for (const r of rows) {
      const def = merged[r.key];
      merged[r.key] =
        def && typeof def === "object" && !Array.isArray(def) && r.value && typeof r.value === "object"
          ? { ...(def as object), ...(r.value as object) }
          : r.value;
    }
    return merged as SiteConfig;
  },
  ["site-config"],
  { tags: [TAGS.settings], revalidate: REVALIDATE }, () => structuredClone(defaultSiteConfig));

/** Site settings: the database on the server build; on the static site, the defaults plus what the owner set in the BuildX App. */
export async function getSiteConfig(): Promise<SiteConfig> {
  if (STATIC_SITE) return applySettings(structuredClone(defaultSiteConfig), await buildSiteSettings());
  return getSiteConfigFromDb();
}

/* ─── Stats (live, from the database) ──────────────────────────────────────── */

export type OrgStats = { members: number; activeProjects: number; teams: number; events: number; achievements: number };

export const getOrgStats = cached(
  async (): Promise<OrgStats> => {
    const [[m], [p], [t], [e], [a]] = await Promise.all([
      db.select({ n: count() }).from(s.members).where(eq(s.members.status, "active")),
      db
        .select({ n: count() })
        .from(s.projects)
        .where(notInArray(s.projects.status, ["completed", "archived"])),
      db.select({ n: count() }).from(s.competitionTeams).where(eq(s.competitionTeams.published, true)),
      db.select({ n: count() }).from(s.events).where(eq(s.events.public, true)),
      db.select({ n: count() }).from(s.achievements).where(eq(s.achievements.public, true)),
    ]);
    return { members: m!.n, activeProjects: p!.n, teams: t!.n, events: e!.n, achievements: a!.n };
  },
  ["org-stats"],
  { tags: [TAGS.stats, TAGS.members, TAGS.projects, TAGS.teams, TAGS.events, TAGS.achievements], revalidate: 600 }, () => ({ members: 0, activeProjects: 0, teams: coreTeams.length, events: 0, achievements: 0 }));

/* ─── Members ──────────────────────────────────────────────────────────────── */

const publicMemberCols = {
  id: s.members.id,
  slug: s.members.slug,
  fullName: s.members.fullName,
  rank: s.members.rank,
  department: s.members.department,
  title: s.members.title,
  academicYear: s.members.academicYear,
  photoId: s.members.photoId,
  skills: s.members.skills,
  sortOrder: s.members.sortOrder,
  trackSlug: s.tracks.slug,
  trackName: s.tracks.name,
  trackCode: s.tracks.code,
  teamSlug: s.competitionTeams.slug,
  teamName: s.competitionTeams.name,
  teamAccent: s.competitionTeams.accent,
};

type MemberRow = {
  id: string;
  slug: string;
  fullName: string;
  rank: MemberCard["rank"];
  department: MemberCard["department"];
  title: string | null;
  academicYear: number | null;
  photoId: string | null;
  skills: string[];
  trackSlug: string | null;
  trackName: string | null;
  trackCode: string | null;
  teamSlug: string | null;
  teamName: string | null;
  teamAccent: string | null;
};

function toCard(r: MemberRow, images: Map<string, PublicImage>): MemberCard {
  return {
    id: r.id,
    slug: r.slug,
    fullName: r.fullName,
    rank: r.rank,
    department: r.department,
    title: r.title,
    academicYear: r.academicYear,
    photo: r.photoId ? (images.get(r.photoId) ?? null) : null,
    skills: r.skills,
    track: r.trackSlug ? { slug: r.trackSlug, name: r.trackName!, code: r.trackCode! } : null,
    team: r.teamSlug ? { slug: r.teamSlug, name: r.teamName!, accent: r.teamAccent! } : null,
  };
}

const publicMemberWhere = and(eq(s.members.publicProfile, true), ne(s.members.status, "inactive"));

async function queryMemberCards(where = publicMemberWhere) {
  const rows = await db
    .select(publicMemberCols)
    .from(s.members)
    .leftJoin(s.tracks, eq(s.tracks.id, s.members.trackId))
    .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.members.teamId))
    .where(where)
    .orderBy(
      sql`array_position(${sql.raw(`ARRAY[${RANK_ORDER.map((r) => `'${r}'`).join(",")}]::member_rank[]`)}, ${s.members.rank})`,
      asc(s.members.sortOrder),
      asc(s.members.fullName),
    );
  const images = await loadImages(rows.map((r) => r.photoId));
  return rows.map((r) => toCard(r as MemberRow, images));
}

export const getPublicMembers = cached(async () => queryMemberCards(), ["public-members"], {
  tags: [TAGS.members],
  revalidate: REVALIDATE,
}, () => []);

export const getPublicMember = cached(
  async (slug: string) => {
    const [m] = await db
      .select({
        ...publicMemberCols,
        bio: s.members.bio,
        linkedin: s.members.linkedin,
        github: s.members.github,
        instagram: s.members.instagram,
        facebook: s.members.facebook,
        youtube: s.members.youtube,
        website: s.members.website,
        joinedAt: s.members.joinedAt,
      })
      .from(s.members)
      .leftJoin(s.tracks, eq(s.tracks.id, s.members.trackId))
      .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.members.teamId))
      .where(and(eq(s.members.slug, slug), publicMemberWhere))
      .limit(1);
    if (!m) return null;
    const [images, projectRows, achievementRows, og] = await Promise.all([
      loadImages([m.photoId]),
      db
        .select({ slug: s.projects.slug, title: s.projects.title, summary: s.projects.summary, role: s.projectMembers.role, status: s.projects.status })
        .from(s.projectMembers)
        .innerJoin(s.projects, eq(s.projects.id, s.projectMembers.projectId))
        .where(and(eq(s.projectMembers.memberId, m.id), eq(s.projects.published, true))),
      db
        .select({ id: s.achievements.id, title: s.achievements.title, kind: s.achievements.kind, achievedOn: s.achievements.achievedOn, rank: s.achievements.rank })
        .from(s.achievementMembers)
        .innerJoin(s.achievements, eq(s.achievements.id, s.achievementMembers.achievementId))
        .where(and(eq(s.achievementMembers.memberId, m.id), eq(s.achievements.public, true)))
        .orderBy(desc(s.achievements.achievedOn)),
      loadOg(m.photoId),
    ]);
    return {
      ...toCard(m as MemberRow, images),
      bio: m.bio,
      joinedAt: m.joinedAt,
      socials: {
        linkedin: m.linkedin,
        github: m.github,
        instagram: m.instagram,
        facebook: m.facebook,
        youtube: m.youtube,
        website: m.website,
      },
      projects: projectRows,
      achievements: achievementRows,
      ogImage: og,
    };
  },
  ["public-member"],
  { tags: [TAGS.members, TAGS.projects, TAGS.achievements], revalidate: REVALIDATE }, () => null);

/* ─── Tracks ───────────────────────────────────────────────────────────────── */

export const getTracks = cached(
  async () => {
    const rows = await db.select().from(s.tracks).where(eq(s.tracks.published, true)).orderBy(asc(s.tracks.sortOrder));
    const counts = await db
      .select({ trackId: s.members.trackId, n: count() })
      .from(s.members)
      .where(eq(s.members.status, "active"))
      .groupBy(s.members.trackId);
    const projectCounts = await db
      .select({ trackId: s.projects.trackId, n: count() })
      .from(s.projects)
      .where(eq(s.projects.published, true))
      .groupBy(s.projects.trackId);
    const images = await loadImages(rows.map((r) => r.coverId));
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      code: t.code,
      name: t.name,
      nameAr: t.nameAr,
      tagline: t.tagline,
      taglineAr: t.taglineAr,
      description: t.description,
      descriptionAr: t.descriptionAr,
      tools: t.tools,
      technologies: t.technologies,
      competitions: t.competitions,
      illustration: t.illustration,
      cover: t.coverId ? (images.get(t.coverId) ?? null) : null,
      memberCount: counts.find((c) => c.trackId === t.id)?.n ?? 0,
      projectCount: projectCounts.find((c) => c.trackId === t.id)?.n ?? 0,
    }));
  },
  ["tracks"],
  { tags: [TAGS.tracks, TAGS.members, TAGS.projects], revalidate: REVALIDATE }, () => fallbackTracks());

export const getTrack = cached(
  async (slug: string) => {
    const [t] = await db
      .select()
      .from(s.tracks)
      .where(and(eq(s.tracks.slug, slug), eq(s.tracks.published, true)))
      .limit(1);
    if (!t) return null;
    const [roadmap, members, projects, gallery, resources] = await Promise.all([
      db.select().from(s.trackRoadmapSteps).where(eq(s.trackRoadmapSteps.trackId, t.id)).orderBy(asc(s.trackRoadmapSteps.position)),
      queryMemberCards(and(publicMemberWhere, eq(s.members.trackId, t.id))),
      queryProjectCards(and(eq(s.projects.published, true), eq(s.projects.trackId, t.id))),
      queryGalleryItems(and(eq(s.galleryItems.published, true), eq(s.galleryItems.trackId, t.id)), 12),
      db
        .select({ id: s.resources.id, title: s.resources.title, description: s.resources.description, kind: s.resources.kind, url: s.resources.url })
        .from(s.resources)
        .where(and(eq(s.resources.published, true), eq(s.resources.trackId, t.id)))
        .orderBy(asc(s.resources.sortOrder)),
    ]);
    const images = await loadImages([t.coverId]);
    return {
      ...t,
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
      cover: t.coverId ? (images.get(t.coverId) ?? null) : null,
      roadmap: roadmap.map((r) => ({ id: r.id, stage: r.stage, title: r.title, description: r.description })),
      members,
      projects,
      gallery,
      resources,
    };
  },
  ["track"],
  { tags: [TAGS.tracks, TAGS.members, TAGS.projects, TAGS.gallery, TAGS.resources], revalidate: REVALIDATE }, (slug: string) => fallbackTrack(slug));

/* ─── Projects ─────────────────────────────────────────────────────────────── */

export type ProjectCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  progress: number;
  technologies: string[];
  featured: boolean;
  hero: PublicImage | null;
  track: { slug: string; name: string; code: string } | null;
  team: { slug: string; name: string; accent: string } | null;
  updatedAt: string;
};

async function queryProjectCards(where: ReturnType<typeof and>, limit = 100): Promise<ProjectCard[]> {
  const rows = await db
    .select({
      id: s.projects.id,
      slug: s.projects.slug,
      title: s.projects.title,
      summary: s.projects.summary,
      status: s.projects.status,
      progress: s.projects.progress,
      technologies: s.projects.technologies,
      featured: s.projects.featured,
      heroId: s.projects.heroId,
      updatedAt: s.projects.updatedAt,
      trackSlug: s.tracks.slug,
      trackName: s.tracks.name,
      trackCode: s.tracks.code,
      teamSlug: s.competitionTeams.slug,
      teamName: s.competitionTeams.name,
      teamAccent: s.competitionTeams.accent,
    })
    .from(s.projects)
    .leftJoin(s.tracks, eq(s.tracks.id, s.projects.trackId))
    .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.projects.teamId))
    .where(where)
    .orderBy(desc(s.projects.featured), desc(s.projects.updatedAt))
    .limit(limit);
  const images = await loadImages(rows.map((r) => r.heroId));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    status: r.status,
    progress: r.progress,
    technologies: r.technologies,
    featured: r.featured,
    hero: r.heroId ? (images.get(r.heroId) ?? null) : null,
    track: r.trackSlug ? { slug: r.trackSlug, name: r.trackName!, code: r.trackCode! } : null,
    team: r.teamSlug ? { slug: r.teamSlug, name: r.teamName!, accent: r.teamAccent! } : null,
    updatedAt: iso(r.updatedAt)!,
  }));
}

export const getProjects = cached(async () => queryProjectCards(eq(s.projects.published, true) as never), ["projects"], {
  tags: [TAGS.projects],
  revalidate: REVALIDATE,
}, () => []);

export const getProject = cached(
  async (slug: string) => {
    const [p] = await db
      .select()
      .from(s.projects)
      .where(and(eq(s.projects.slug, slug), eq(s.projects.published, true)))
      .limit(1);
    if (!p) return null;
    const [cards, team, milestones, gallery, awards, video, track, managerRows, og] = await Promise.all([
      queryProjectCards(eq(s.projects.id, p.id) as never, 1),
      db
        .select({ ...publicMemberCols, role: s.projectMembers.role })
        .from(s.projectMembers)
        .innerJoin(s.members, eq(s.members.id, s.projectMembers.memberId))
        .leftJoin(s.tracks, eq(s.tracks.id, s.members.trackId))
        .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.members.teamId))
        .where(and(eq(s.projectMembers.projectId, p.id), publicMemberWhere)),
      db.select().from(s.projectMilestones).where(eq(s.projectMilestones.projectId, p.id)).orderBy(asc(s.projectMilestones.position), asc(s.projectMilestones.dueDate)),
      queryGalleryItems(and(eq(s.galleryItems.published, true), eq(s.galleryItems.projectId, p.id)), 24),
      db
        .select({ id: s.achievements.id, title: s.achievements.title, kind: s.achievements.kind, achievedOn: s.achievements.achievedOn, rank: s.achievements.rank })
        .from(s.achievements)
        .where(and(eq(s.achievements.projectId, p.id), eq(s.achievements.public, true))),
      p.videoId ? queryVideos(eq(s.videos.id, p.videoId) as never) : Promise.resolve([]),
      p.trackId ? db.select({ slug: s.tracks.slug, name: s.tracks.name }).from(s.tracks).where(eq(s.tracks.id, p.trackId)) : Promise.resolve([]),
      p.managerId
        ? db.select({ slug: s.members.slug, fullName: s.members.fullName, publicProfile: s.members.publicProfile }).from(s.members).where(eq(s.members.id, p.managerId))
        : Promise.resolve([]),
      loadOg(p.heroId),
    ]);
    const memberImages = await loadImages(team.map((m) => m.photoId));
    const manager = managerRows[0];
    return {
      ...cards[0]!,
      problem: p.problem,
      solution: p.solution,
      electronics: p.electronics,
      mechanical: p.mechanical,
      software: p.software,
      challenges: p.challenges,
      testing: p.testing,
      results: p.results,
      githubUrl: p.githubUrl,
      demoUrl: p.demoUrl,
      startDate: p.startDate,
      endDate: p.endDate,
      trackName: track[0]?.name ?? null,
      manager: manager?.publicProfile ? { slug: manager.slug, fullName: manager.fullName } : null,
      crew: team.map((m) => ({ ...toCard(m as MemberRow, memberImages), role: m.role })),
      milestones: milestones.map((m) => ({ id: m.id, title: m.title, description: m.description, dueDate: m.dueDate, completedAt: iso(m.completedAt) })),
      gallery,
      awards,
      video: video[0] ?? null,
      ogImage: og,
    };
  },
  ["project"],
  { tags: [TAGS.projects, TAGS.members, TAGS.gallery, TAGS.achievements, TAGS.videos], revalidate: REVALIDATE }, () => null);

/* ─── Competition teams ────────────────────────────────────────────────────── */

export const getTeams = cached(
  async () => {
    const rows = await db
      .select()
      .from(s.competitionTeams)
      .where(eq(s.competitionTeams.published, true))
      .orderBy(asc(s.competitionTeams.sortOrder));
    const [counts, wins] = await Promise.all([
      db.select({ teamId: s.members.teamId, n: count() }).from(s.members).where(eq(s.members.status, "active")).groupBy(s.members.teamId),
      db.select({ teamId: s.achievements.teamId, n: count() }).from(s.achievements).where(eq(s.achievements.public, true)).groupBy(s.achievements.teamId),
    ]);
    const images = await loadImages(rows.map((r) => r.coverId));
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      code: t.code,
      name: t.name,
      nameAr: t.nameAr,
      discipline: t.discipline,
      summary: t.summary,
      accent: t.accent,
      robotName: t.robotName,
      cover: t.coverId ? (images.get(t.coverId) ?? null) : null,
      memberCount: counts.find((c) => c.teamId === t.id)?.n ?? 0,
      achievementCount: wins.find((c) => c.teamId === t.id)?.n ?? 0,
    }));
  },
  ["teams"],
  { tags: [TAGS.teams, TAGS.members, TAGS.achievements], revalidate: REVALIDATE }, () => fallbackTeams());

/** Teams with their spec sheets (homepage garage + competitions index). */
export const getTeamsWithSpecs = cached(
  async () => {
    const [teams, specs] = await Promise.all([
      getTeams(),
      db.select({ teamId: s.teamSpecs.teamId, label: s.teamSpecs.label, value: s.teamSpecs.value, position: s.teamSpecs.position }).from(s.teamSpecs).orderBy(asc(s.teamSpecs.position)),
    ]);
    return teams.map((t) => ({ ...t, specs: specs.filter((x) => x.teamId === t.id).map((x) => ({ label: x.label, value: x.value })) }));
  },
  ["teams-specs"],
  { tags: [TAGS.teams, TAGS.members, TAGS.achievements], revalidate: REVALIDATE }, () => fallbackTeamsWithSpecs());

export const getTeam = cached(
  async (slug: string) => {
    const [t] = await db
      .select()
      .from(s.competitionTeams)
      .where(and(eq(s.competitionTeams.slug, slug), eq(s.competitionTeams.published, true)))
      .limit(1);
    if (!t) return null;
    const [specs, members, comps, achievements, gallery, videos, projects, og] = await Promise.all([
      db.select().from(s.teamSpecs).where(eq(s.teamSpecs.teamId, t.id)).orderBy(asc(s.teamSpecs.position)),
      queryMemberCards(and(publicMemberWhere, eq(s.members.teamId, t.id))),
      db
        .select({
          id: s.competitions.id,
          name: s.competitions.name,
          organizer: s.competitions.organizer,
          location: s.competitions.location,
          startsAt: s.competitions.startsAt,
          status: s.competitions.status,
          result: s.competitions.result,
          rank: s.competitions.rank,
        })
        .from(s.competitions)
        .where(eq(s.competitions.teamId, t.id))
        .orderBy(desc(s.competitions.startsAt)),
      db
        .select({ id: s.achievements.id, title: s.achievements.title, kind: s.achievements.kind, achievedOn: s.achievements.achievedOn, rank: s.achievements.rank, description: s.achievements.description })
        .from(s.achievements)
        .where(and(eq(s.achievements.teamId, t.id), eq(s.achievements.public, true)))
        .orderBy(desc(s.achievements.achievedOn)),
      queryGalleryItems(and(eq(s.galleryItems.published, true), eq(s.galleryItems.teamId, t.id)), 18),
      queryVideos(and(eq(s.videos.published, true), eq(s.videos.teamId, t.id)) as never),
      queryProjectCards(and(eq(s.projects.published, true), eq(s.projects.teamId, t.id))),
      loadOg(t.coverId),
    ]);
    const images = await loadImages([t.coverId]);
    const captain = t.captainId ? members.find((m) => m.id === t.captainId) ?? null : null;
    return {
      id: t.id,
      slug: t.slug,
      code: t.code,
      name: t.name,
      discipline: t.discipline,
      summary: t.summary,
      description: t.description,
      accent: t.accent,
      robotName: t.robotName,
      robotDescription: t.robotDescription,
      cover: t.coverId ? (images.get(t.coverId) ?? null) : null,
      specs: specs.map((x) => ({ label: x.label, value: x.value })),
      captain,
      members,
      competitions: comps.map((c) => ({ ...c, startsAt: iso(c.startsAt) })),
      achievements,
      gallery,
      videos,
      projects,
      ogImage: og,
    };
  },
  ["team"],
  { tags: [TAGS.teams, TAGS.members, TAGS.competitions, TAGS.achievements, TAGS.gallery, TAGS.videos, TAGS.projects], revalidate: REVALIDATE }, (slug: string) => fallbackTeam(slug));

/* ─── Events ───────────────────────────────────────────────────────────────── */

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  type: string;
  description: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  cover: PublicImage | null;
  registrationUrl: string | null;
  ctaLabel: string | null;
};

async function queryEvents(where: ReturnType<typeof and>, order: "asc" | "desc", limit: number): Promise<EventCard[]> {
  const rows = await db
    .select()
    .from(s.events)
    .where(where)
    .orderBy(order === "asc" ? asc(s.events.startsAt) : desc(s.events.startsAt))
    .limit(limit);
  const images = await loadImages(rows.map((r) => r.coverId));
  return rows.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    type: e.type,
    description: e.description,
    location: e.location,
    startsAt: iso(e.startsAt)!,
    endsAt: iso(e.endsAt),
    allDay: e.allDay,
    cover: e.coverId ? (images.get(e.coverId) ?? null) : null,
    registrationUrl: e.registrationUrl,
    ctaLabel: e.ctaLabel,
  }));
}

export const getEvents = cached(
  async () => {
    const now = new Date();
    const [upcoming, past] = await Promise.all([
      queryEvents(and(eq(s.events.public, true), gte(s.events.startsAt, new Date(now.getTime() - 6 * 3600_000))), "asc", 50),
      queryEvents(and(eq(s.events.public, true), lt(s.events.startsAt, new Date(now.getTime() - 6 * 3600_000))), "desc", 30),
    ]);
    return { upcoming, past };
  },
  ["events"],
  { tags: [TAGS.events], revalidate: 900 }, () => ({ upcoming: [], past: [] }));

export const getEvent = cached(
  async (slug: string) => {
    const [row] = await queryEvents(and(eq(s.events.public, true), eq(s.events.slug, slug)), "asc", 1);
    if (!row) return null;
    const [e] = await db.select({ coverId: s.events.coverId }).from(s.events).where(eq(s.events.slug, slug));
    return { ...row, ogImage: await loadOg(e?.coverId) };
  },
  ["event"],
  { tags: [TAGS.events], revalidate: 900 }, () => null);

/* ─── Achievements & competitions ─────────────────────────────────────────── */

export const getAchievements = cached(
  async () => {
    const rows = await db
      .select({
        id: s.achievements.id,
        title: s.achievements.title,
        description: s.achievements.description,
        kind: s.achievements.kind,
        achievedOn: s.achievements.achievedOn,
        rank: s.achievements.rank,
        imageId: s.achievements.imageId,
        teamName: s.competitionTeams.name,
        teamSlug: s.competitionTeams.slug,
        teamAccent: s.competitionTeams.accent,
        competitionName: s.competitions.name,
        projectSlug: s.projects.slug,
        projectTitle: s.projects.title,
        projectPublished: s.projects.published,
      })
      .from(s.achievements)
      .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.achievements.teamId))
      .leftJoin(s.competitions, eq(s.competitions.id, s.achievements.competitionId))
      .leftJoin(s.projects, eq(s.projects.id, s.achievements.projectId))
      .where(eq(s.achievements.public, true))
      .orderBy(desc(s.achievements.achievedOn));
    const images = await loadImages(rows.map((r) => r.imageId));
    return rows.map(({ imageId, projectPublished, projectSlug, projectTitle, ...r }) => ({
      ...r,
      image: imageId ? (images.get(imageId) ?? null) : null,
      project: projectPublished && projectSlug ? { slug: projectSlug, title: projectTitle! } : null,
    }));
  },
  ["achievements"],
  { tags: [TAGS.achievements, TAGS.teams, TAGS.competitions, TAGS.projects], revalidate: REVALIDATE }, () => []);

export const getUpcomingCompetitions = cached(
  async () => {
    const rows = await db
      .select({
        id: s.competitions.id,
        name: s.competitions.name,
        organizer: s.competitions.organizer,
        location: s.competitions.location,
        startsAt: s.competitions.startsAt,
        status: s.competitions.status,
        teamName: s.competitionTeams.name,
        teamAccent: s.competitionTeams.accent,
      })
      .from(s.competitions)
      .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.competitions.teamId))
      .where(and(isNotNull(s.competitions.startsAt), gte(s.competitions.startsAt, new Date())))
      .orderBy(asc(s.competitions.startsAt))
      .limit(6);
    return rows.map((r) => ({ ...r, startsAt: iso(r.startsAt) }));
  },
  ["upcoming-competitions"],
  { tags: [TAGS.competitions], revalidate: 900 }, () => []);

/* ─── Bootcamp ─────────────────────────────────────────────────────────────── */

export const getBootcamp = cached(
  async () => {
    const modules = await db.select().from(s.bootcampModules).where(eq(s.bootcampModules.published, true)).orderBy(asc(s.bootcampModules.week));
    const lessons = modules.length
      ? await db
          .select()
          .from(s.bootcampLessons)
          .where(inArray(s.bootcampLessons.moduleId, modules.map((m) => m.id)))
          .orderBy(asc(s.bootcampLessons.position))
      : [];
    const sessions = await queryEvents(and(eq(s.events.public, true), eq(s.events.type, "bootcamp")), "asc", 20);
    return {
      modules: modules.map((m) => ({
        id: m.id,
        week: m.week,
        title: m.title,
        summary: m.summary,
        outcomes: m.outcomes,
        lessons: lessons.filter((l) => l.moduleId === m.id).map((l) => ({ id: l.id, title: l.title, durationMinutes: l.durationMinutes })),
      })),
      sessions,
    };
  },
  ["bootcamp"],
  { tags: [TAGS.bootcamp, TAGS.events], revalidate: REVALIDATE }, () => fallbackBootcamp());

/* ─── Gallery & video ─────────────────────────────────────────────────────── */

export type GalleryItem = { id: string; caption: string | null; category: string; tags: string[]; takenOn: string | null; featured: boolean; image: PublicImage };

async function queryGalleryItems(where: ReturnType<typeof and>, limit = 60): Promise<GalleryItem[]> {
  const rows = await db
    .select()
    .from(s.galleryItems)
    .where(where)
    .orderBy(desc(s.galleryItems.featured), asc(s.galleryItems.sortOrder), desc(s.galleryItems.createdAt))
    .limit(limit);
  const images = await loadImages(rows.map((r) => r.assetId));
  return rows
    .filter((r) => images.has(r.assetId))
    .map((r) => ({
      id: r.id,
      caption: r.caption,
      category: r.category,
      tags: r.tags,
      takenOn: r.takenOn,
      featured: r.featured,
      image: { ...images.get(r.assetId)!, alt: r.caption ?? images.get(r.assetId)!.alt },
    }));
}

export const getGallery = cached(
  async () => {
    const albums = await db
      .select()
      .from(s.galleryAlbums)
      .where(eq(s.galleryAlbums.published, true))
      .orderBy(desc(s.galleryAlbums.takenOn), desc(s.galleryAlbums.createdAt));
    const albumCounts = albums.length
      ? await db
          .select({ albumId: s.galleryItems.albumId, n: count() })
          .from(s.galleryItems)
          .where(and(eq(s.galleryItems.published, true), inArray(s.galleryItems.albumId, albums.map((a) => a.id))))
          .groupBy(s.galleryItems.albumId)
      : [];
    const covers = await loadImages(albums.map((a) => a.coverId));
    const items = await queryGalleryItems(eq(s.galleryItems.published, true) as never, 120);
    return {
      albums: albums.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        description: a.description,
        category: a.category,
        takenOn: a.takenOn,
        cover: a.coverId ? (covers.get(a.coverId) ?? null) : null,
        count: albumCounts.find((c) => c.albumId === a.id)?.n ?? 0,
      })),
      items,
    };
  },
  ["gallery"],
  { tags: [TAGS.gallery], revalidate: REVALIDATE }, () => ({ albums: [], items: [] }));

export const getAlbum = cached(
  async (slug: string) => {
    const [a] = await db
      .select()
      .from(s.galleryAlbums)
      .where(and(eq(s.galleryAlbums.slug, slug), eq(s.galleryAlbums.published, true)))
      .limit(1);
    if (!a) return null;
    const items = await queryGalleryItems(and(eq(s.galleryItems.published, true), eq(s.galleryItems.albumId, a.id)), 300);
    return { id: a.id, slug: a.slug, title: a.title, description: a.description, category: a.category, takenOn: a.takenOn, items, ogImage: await loadOg(a.coverId) };
  },
  ["album"],
  { tags: [TAGS.gallery], revalidate: REVALIDATE }, () => null);

async function queryVideos(where: ReturnType<typeof and>): Promise<VideoSource[]> {
  const rows = await db.select().from(s.videos).where(where).orderBy(desc(s.videos.featured), desc(s.videos.createdAt)).limit(60);
  const posters = await loadImages(rows.map((r) => r.posterId));
  const cc = env().CLOUDFLARE_STREAM_CUSTOMER_CODE;
  return rows.map((v) => {
    const r = resolveVideo(v.provider, v.source, cc);
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      kind: v.kind,
      provider: v.provider,
      hls: r.hls,
      youtubeId: r.youtubeId,
      poster: (v.posterId && posters.get(v.posterId)?.src) || r.poster,
      durationSeconds: v.durationSeconds,
    };
  });
}

export const getVideos = cached(async () => queryVideos(eq(s.videos.published, true) as never), ["videos"], {
  tags: [TAGS.videos],
  revalidate: REVALIDATE,
}, () => []);

export const getVideo = cached(
  async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [v] = await queryVideos(and(eq(s.videos.id, id), eq(s.videos.published, true)));
    return v ?? null;
  },
  ["video"],
  { tags: [TAGS.videos], revalidate: REVALIDATE }, () => null);

/* ─── Sponsors, articles, resources ───────────────────────────────────────── */

export const getSponsors = cached(
  async () => {
    const rows = await db.select().from(s.sponsors).where(eq(s.sponsors.active, true)).orderBy(asc(s.sponsors.sortOrder), asc(s.sponsors.name));
    const logos = await loadImages(rows.map((r) => r.logoId));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      tier: r.tier,
      website: r.website,
      description: r.description,
      logo: r.logoId ? (logos.get(r.logoId) ?? null) : null,
    }));
  },
  ["sponsors"],
  { tags: [TAGS.sponsors], revalidate: REVALIDATE }, () => []);

export const getArticles = cached(
  async () => {
    const rows = await db
      .select({
        id: s.articles.id,
        slug: s.articles.slug,
        kind: s.articles.kind,
        title: s.articles.title,
        excerpt: s.articles.excerpt,
        coverId: s.articles.coverId,
        publishedAt: s.articles.publishedAt,
        authorName: s.members.fullName,
      })
      .from(s.articles)
      .leftJoin(s.members, eq(s.members.id, s.articles.authorId))
      .where(and(isNotNull(s.articles.publishedAt), lte(s.articles.publishedAt, new Date())))
      .orderBy(desc(s.articles.publishedAt))
      .limit(100);
    const covers = await loadImages(rows.map((r) => r.coverId));
    return rows.map(({ coverId, ...r }) => ({ ...r, publishedAt: iso(r.publishedAt)!, cover: coverId ? (covers.get(coverId) ?? null) : null }));
  },
  ["articles"],
  { tags: [TAGS.articles], revalidate: 900 }, () => []);

export const getArticle = cached(
  async (slug: string) => {
    const [a] = await db
      .select({
        id: s.articles.id,
        slug: s.articles.slug,
        kind: s.articles.kind,
        title: s.articles.title,
        excerpt: s.articles.excerpt,
        body: s.articles.body,
        coverId: s.articles.coverId,
        publishedAt: s.articles.publishedAt,
        updatedAt: s.articles.updatedAt,
        authorName: s.members.fullName,
        authorSlug: s.members.slug,
        authorPublic: s.members.publicProfile,
      })
      .from(s.articles)
      .leftJoin(s.members, eq(s.members.id, s.articles.authorId))
      .where(and(eq(s.articles.slug, slug), isNotNull(s.articles.publishedAt), lte(s.articles.publishedAt, new Date())))
      .limit(1);
    if (!a) return null;
    const covers = await loadImages([a.coverId]);
    return {
      ...a,
      authorSlug: a.authorPublic ? a.authorSlug : null,
      publishedAt: iso(a.publishedAt)!,
      updatedAt: iso(a.updatedAt)!,
      cover: a.coverId ? (covers.get(a.coverId) ?? null) : null,
      ogImage: await loadOg(a.coverId),
    };
  },
  ["article"],
  { tags: [TAGS.articles], revalidate: 900 }, () => null);

export const getResources = cached(
  async () =>
    db
      .select({
        id: s.resources.id,
        title: s.resources.title,
        description: s.resources.description,
        kind: s.resources.kind,
        url: s.resources.url,
        trackName: s.tracks.name,
        trackSlug: s.tracks.slug,
      })
      .from(s.resources)
      .leftJoin(s.tracks, eq(s.tracks.id, s.resources.trackId))
      .where(eq(s.resources.published, true))
      .orderBy(asc(s.tracks.sortOrder), asc(s.resources.sortOrder)),
  ["resources"],
  { tags: [TAGS.resources, TAGS.tracks], revalidate: REVALIDATE }, () => []);

/* ─── Sitemap ─────────────────────────────────────────────────────────────── */

export const getSitemapEntries = cached(
  async () => {
    const [members, projects, events, tracks, teams, articles, albums] = await Promise.all([
      db.select({ slug: s.members.slug, updatedAt: s.members.updatedAt }).from(s.members).where(publicMemberWhere),
      db.select({ slug: s.projects.slug, updatedAt: s.projects.updatedAt }).from(s.projects).where(eq(s.projects.published, true)),
      db.select({ slug: s.events.slug, updatedAt: s.events.updatedAt }).from(s.events).where(eq(s.events.public, true)),
      db.select({ slug: s.tracks.slug, updatedAt: s.tracks.updatedAt }).from(s.tracks).where(eq(s.tracks.published, true)),
      db.select({ slug: s.competitionTeams.slug, updatedAt: s.competitionTeams.updatedAt }).from(s.competitionTeams).where(eq(s.competitionTeams.published, true)),
      db.select({ slug: s.articles.slug, updatedAt: s.articles.updatedAt }).from(s.articles).where(and(isNotNull(s.articles.publishedAt), lte(s.articles.publishedAt, new Date()))),
      db.select({ slug: s.galleryAlbums.slug, updatedAt: s.galleryAlbums.updatedAt }).from(s.galleryAlbums).where(eq(s.galleryAlbums.published, true)),
    ]);
    const m = (rows: { slug: string; updatedAt: Date }[]) => rows.map((r) => ({ slug: r.slug, updatedAt: iso(r.updatedAt)! }));
    return { members: m(members), projects: m(projects), events: m(events), tracks: m(tracks), teams: m(teams), articles: m(articles), albums: m(albums) };
  },
  ["sitemap"],
  { tags: [TAGS.members, TAGS.projects, TAGS.events, TAGS.tracks, TAGS.teams, TAGS.articles, TAGS.gallery], revalidate: REVALIDATE }, () => ({ members: [], projects: [], events: [], tracks: coreTracks.map((t) => ({ slug: t.slug, updatedAt: "2026-01-01T00:00:00.000Z" })), teams: coreTeams.map((t) => ({ slug: t.slug, updatedAt: "2026-01-01T00:00:00.000Z" })), articles: [], albums: [] }));
