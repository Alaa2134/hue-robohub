import "server-only";
import { asc, desc, ne } from "drizzle-orm";
import { db, schema as s } from "../db";

/** Small id/name lists for Command Center selects. */
export const options = {
  teams: () => db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder)),
  members: () => db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(ne(s.members.status, "alumni")).orderBy(asc(s.members.fullName)),
  projects: () => db.select({ id: s.projects.id, name: s.projects.title }).from(s.projects).where(ne(s.projects.status, "archived")).orderBy(asc(s.projects.title)),
  competitions: () => db.select({ id: s.competitions.id, name: s.competitions.name }).from(s.competitions).orderBy(desc(s.competitions.startsAt)),
};
