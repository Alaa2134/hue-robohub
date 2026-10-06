import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission, type Role } from "@/lib/permissions";
import { AppError } from "./errors";
import { getSession } from "./session";

export type Actor = {
  userId: string;
  role: Role;
  name: string;
  email: string;
  memberId: string | null;
  sessionId: string;
};

export async function getActor(): Promise<Actor | null> {
  const s = await getSession();
  if (!s || s.pendingMfa) return null;
  return { userId: s.userId, role: s.role, name: s.name, email: s.email, memberId: s.memberId, sessionId: s.sessionId };
}

export function assertCan(actor: Actor | null, permission: Permission): asserts actor is Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (!can(actor.role, permission)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
}

export function assertAny(actor: Actor | null, permissions: Permission[]): asserts actor is Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (!permissions.some((p) => can(actor.role, p))) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
}

/** For server-component pages: redirects instead of throwing. */
export async function requirePage(permission?: Permission | Permission[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(actor.role, p))) redirect("/403");
  }
  return actor;
}
