import "server-only";
import { and, eq } from "drizzle-orm";
import { can } from "@/lib/permissions";
import type { Actor } from "../auth/guard";
import { db, schema as s } from "../db";

/** Leads/admins edit any project; members edit projects they manage or belong to. */
export async function canEditProject(actor: Actor, projectId: string) {
  if (can(actor.role, "projects.manage")) return true;
  if (!can(actor.role, "projects.manage_own") || !actor.memberId) return false;
  const [p] = await db.select({ managerId: s.projects.managerId }).from(s.projects).where(eq(s.projects.id, projectId)).limit(1);
  if (p?.managerId === actor.memberId) return true;
  const [pm] = await db.select({ m: s.projectMembers.memberId }).from(s.projectMembers).where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.memberId, actor.memberId))).limit(1);
  return !!pm;
}
