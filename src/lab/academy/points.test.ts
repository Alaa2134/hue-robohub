import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRACKS } from "../robot/tracks";
import { CHALLENGES } from "./challenges";
import { CHALLENGE_INFO, CHALLENGE_POINTS } from "./points";

describe("challenge points", () => {
  it("every challenge and robot track has points, and nothing else does", () => {
    const slugs = [...CHALLENGES.map((c) => c.slug), ...TRACKS.map((t) => `robot-${t.id}`)].sort();
    expect(Object.keys(CHALLENGE_POINTS).sort()).toEqual(slugs);
    for (const c of CHALLENGES) expect(CHALLENGE_POINTS[c.slug], c.slug).toBe(c.level * 10);
  });

  it("names each challenge as the Lab does", () => {
    for (const c of CHALLENGES) expect(CHALLENGE_INFO[c.slug].title, c.slug).toEqual(c.title);
    for (const t of TRACKS) expect(CHALLENGE_INFO[`robot-${t.id}`].title.en).toContain(t.name.en);
  });

  it("matches the database's list", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261026200000_academy.sql", import.meta.url), "utf8");
    const seed = sql.match(/insert into public\.lab_challenges \(slug, points, skill\) values([\s\S]*?)on conflict/)![1];
    const rows = [...seed.matchAll(/\('([a-z0-9-]+)', (\d+), '([a-z]+)'\)/g)];
    expect(Object.fromEntries(rows.map((m) => [m[1], Number(m[2])]))).toEqual(CHALLENGE_POINTS);
    expect(Object.fromEntries(rows.map((m) => [m[1], m[3]]))).toEqual(Object.fromEntries(Object.entries(CHALLENGE_INFO).map(([k, v]) => [k, v.skill])));
  });
});
