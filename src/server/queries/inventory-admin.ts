import "server-only";
import { asc, ne } from "drizzle-orm";
import { db, schema as s } from "../db";

export async function inventoryOptions() {
  const [projects, members] = await Promise.all([
    db.select({ id: s.projects.id, name: s.projects.title }).from(s.projects).where(ne(s.projects.status, "archived")).orderBy(asc(s.projects.title)),
    db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(ne(s.members.status, "alumni")).orderBy(asc(s.members.fullName)),
  ]);
  return { projects, members };
}
