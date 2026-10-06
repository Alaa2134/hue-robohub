/**
 * Role-based access control matrix. Pure data — imported by the server for enforcement and by the
 * client only to decide what to *show*. Showing/hiding UI is never treated as security.
 */

export const ROLES = ["owner", "admin", "lead", "member", "trainee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { owner: 5, admin: 4, lead: 3, member: 2, trainee: 1 };

export const PERMISSIONS = [
  "dashboard.view",
  "members.view",
  "members.view_private",
  "members.manage",
  "applications.view",
  "applications.decide",
  "teams.manage",
  "projects.view",
  "projects.manage",
  "projects.manage_own",
  "bom.manage",
  "inventory.view",
  "inventory.manage",
  "tasks.view",
  "tasks.manage",
  "tasks.manage_own",
  "events.view",
  "events.manage",
  "competitions.view",
  "competitions.manage",
  "bootcamp.view",
  "bootcamp.manage",
  "attendance.view",
  "attendance.manage",
  "attendance.self",
  "gallery.manage",
  "media.generate",
  "files.view",
  "files.manage",
  "sponsors.manage",
  "content.manage",
  "reports.view",
  "accounts.view",
  "accounts.manage",
  "audit.view",
  "settings.manage",
  "messages.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MEMBER_BASE: Permission[] = [
  "dashboard.view",
  "members.view",
  "projects.view",
  "projects.manage_own",
  "tasks.view",
  "tasks.manage_own",
  "events.view",
  "competitions.view",
  "bootcamp.view",
  "attendance.self",
  "inventory.view",
  "files.view",
];

const LEAD: Permission[] = [
  ...MEMBER_BASE,
  "applications.view",
  "projects.manage",
  "bom.manage",
  "inventory.manage",
  "tasks.manage",
  "events.manage",
  "competitions.manage",
  "bootcamp.manage",
  "attendance.view",
  "attendance.manage",
  "gallery.manage",
  "media.generate",
  "files.manage",
  "reports.view",
];

const ADMIN: Permission[] = [
  ...LEAD,
  "members.view_private",
  "members.manage",
  "applications.decide",
  "teams.manage",
  "sponsors.manage",
  "content.manage",
  "accounts.view",
  "accounts.manage",
  "audit.view",
  "settings.manage",
  "messages.view",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set(ADMIN),
  lead: new Set(LEAD),
  member: new Set(MEMBER_BASE),
  trainee: new Set<Permission>(["dashboard.view", "events.view", "bootcamp.view", "attendance.self", "tasks.view", "tasks.manage_own"]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Account-management guard: nobody may grant a role above their own, and only owners may manage
 * owners/admins. Prevents privilege escalation through the Accounts screen.
 */
export function canAssignRole(actor: Role, currentTargetRole: Role | null, nextRole: Role): boolean {
  if (!can(actor, "accounts.manage")) return false;
  if (actor === "owner") return true;
  if (nextRole === "owner" || nextRole === "admin") return false;
  if (currentTargetRole === "owner" || currentTargetRole === "admin") return false;
  return ROLE_RANK[nextRole] < ROLE_RANK[actor];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  lead: "Lead",
  member: "Member",
  trainee: "Trainee",
};
