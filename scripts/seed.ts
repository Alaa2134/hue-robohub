/**
 * Seeds organisation reference content. Idempotent: existing rows (matched by slug/week) are left untouched,
 * so it is safe to run on every deploy.
 */
import { sql } from "drizzle-orm";
import { coreBootcamp, coreTeams, coreTracks } from "@/content/core-content";
import { getDb, schema } from "@/server/db";

const db = getDb();

async function main() {
  for (const [i, t] of coreTracks.entries()) {
    const [row] = await db
      .insert(schema.tracks)
      .values({
        slug: t.slug,
        code: t.code,
        name: t.name,
        nameAr: t.nameAr,
        tagline: t.tagline,
        taglineAr: t.taglineAr,
        description: t.description,
        descriptionAr: t.descriptionAr,
        illustration: t.illustration,
        tools: [...t.tools],
        technologies: [...t.technologies],
        competitions: [...t.competitions],
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.tracks.slug })
      .returning({ id: schema.tracks.id });
    if (row) {
      await db.insert(schema.trackRoadmapSteps).values(
        t.roadmap.map(([stage, title, description], position) => ({ trackId: row.id, stage, title, description, position })),
      );
    }
  }

  for (const [i, t] of coreTeams.entries()) {
    const [row] = await db
      .insert(schema.competitionTeams)
      .values({
        slug: t.slug,
        code: t.code,
        name: t.name,
        nameAr: t.nameAr,
        discipline: t.discipline,
        accent: t.accent,
        summary: t.summary,
        description: t.description,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.competitionTeams.slug })
      .returning({ id: schema.competitionTeams.id });
    if (row) {
      await db
        .insert(schema.teamSpecs)
        .values(t.specs.map(([label, value], position) => ({ teamId: row.id, label, value, position })));
    }
  }

  for (const m of coreBootcamp) {
    const [row] = await db
      .insert(schema.bootcampModules)
      .values({ week: m.week, title: m.title, summary: m.summary, outcomes: [...m.outcomes] })
      .onConflictDoNothing({ target: schema.bootcampModules.week })
      .returning({ id: schema.bootcampModules.id });
    if (row) {
      await db
        .insert(schema.bootcampLessons)
        .values(m.lessons.map((title, position) => ({ moduleId: row.id, title, position, durationMinutes: 90 })));
    }
  }

  const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from tracks`);
  console.log(JSON.stringify({ level: "info", msg: "core content seeded", tracks: count }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
