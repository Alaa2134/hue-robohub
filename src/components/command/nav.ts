import type { IconName } from "@/components/brand/icons";
import { can, type Permission, type Role } from "@/lib/permissions";

export type CmdNavItem = { href: string; label: string; icon: IconName; perm: Permission | Permission[]; keywords?: string };
export type CmdNavGroup = { label: string; items: CmdNavItem[] };

/** Command Center information architecture. Visibility is a convenience; every page and action re-checks on the server. */
export const CMD_NAV: CmdNavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/command", label: "Overview", icon: "gauge", perm: "dashboard.view", keywords: "dashboard home mission control" },
      { href: "/command/calendar", label: "Calendar", icon: "calendar", perm: "events.view", keywords: "events schedule sessions" },
      { href: "/command/tasks", label: "Tasks", icon: "check", perm: "tasks.view", keywords: "kanban todo board" },
      { href: "/command/attendance", label: "Attendance", icon: "qr", perm: ["attendance.view", "attendance.self"], keywords: "check in qr" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/command/members", label: "Members", icon: "users", perm: "members.view", keywords: "team people profiles add member" },
      { href: "/command/applications", label: "Applications", icon: "rocket", perm: "applications.view", keywords: "recruitment applicants interview trainee" },
      { href: "/command/teams", label: "Competition teams", icon: "flag", perm: "competitions.view", keywords: "line follower sumo sprint autonomous innovation" },
      { href: "/command/accounts", label: "Accounts", icon: "lock", perm: "accounts.view", keywords: "users roles access" },
    ],
  },
  {
    label: "Engineering",
    items: [
      { href: "/command/projects", label: "Projects", icon: "cpu", perm: "projects.view", keywords: "case studies bom budget" },
      { href: "/command/inventory", label: "Inventory", icon: "layers", perm: "inventory.view", keywords: "parts components stock bom" },
      { href: "/command/competitions", label: "Competitions", icon: "trophy", perm: "competitions.view", keywords: "results rankings" },
      { href: "/command/bootcamp", label: "Bootcamp", icon: "robot", perm: "bootcamp.view", keywords: "weeks curriculum trainees" },
    ],
  },
  {
    label: "Media",
    items: [
      { href: "/command/gallery", label: "Gallery", icon: "image", perm: "gallery.manage", keywords: "photos albums" },
      { href: "/command/studio", label: "Media Studio", icon: "diamond", perm: "media.generate", keywords: "posters export png instagram" },
      { href: "/command/videos", label: "Videos", icon: "film", perm: "gallery.manage", keywords: "youtube stream hls films" },
      { href: "/command/files", label: "Files", icon: "book", perm: "files.view", keywords: "documents datasheets uploads" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/command/sponsors", label: "Sponsors", icon: "handshake", perm: "sponsors.manage", keywords: "partners" },
      { href: "/command/content", label: "Website content", icon: "globe", perm: "content.manage", keywords: "cms hero about contact socials recruitment open close settings" },
      { href: "/command/messages", label: "Messages", icon: "mail", perm: "messages.view", keywords: "contact inbox inquiries sponsorship" },
      { href: "/command/reports", label: "Reports", icon: "signal", perm: "reports.view", keywords: "analytics export" },
      { href: "/command/audit", label: "Audit log", icon: "shield", perm: "audit.view", keywords: "security history" },
      { href: "/command/settings", label: "Settings", icon: "wrench", perm: "dashboard.view", keywords: "profile password mfa security" },
    ],
  },
];

export function visibleNav(role: Role): CmdNavGroup[] {
  return CMD_NAV.map((g) => ({ ...g, items: g.items.filter((i) => (Array.isArray(i.perm) ? i.perm : [i.perm]).some((p) => can(role, p))) })).filter((g) => g.items.length > 0);
}
