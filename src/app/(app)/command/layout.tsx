import type { ReactNode } from "react";
import { visibleNav } from "@/components/command/nav";
import { CommandShell, type QuickAction } from "@/components/command/shell";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { unreadNotifications } from "@/server/queries/command";

export default async function CommandLayout({ children }: { children: ReactNode }) {
  const actor = await requirePage("dashboard.view");
  const nav = visibleNav(actor.role);
  const actions: QuickAction[] = [
    can(actor.role, "members.manage") && { label: "Add member", href: "/command/members/new", icon: "users" as const },
    can(actor.role, "projects.manage") && { label: "New project", href: "/command/projects/new", icon: "cpu" as const },
    can(actor.role, "tasks.view") && { label: "New task", href: "/command/tasks?new=1", icon: "check" as const },
    can(actor.role, "events.manage") && { label: "Schedule event", href: "/command/calendar?new=1", icon: "calendar" as const },
    can(actor.role, "media.generate") && { label: "Create poster", href: "/command/studio", icon: "diamond" as const },
    { label: "Security & MFA", href: "/command/settings#security", icon: "shield" as const },
  ].filter(Boolean) as QuickAction[];
  const unread = await unreadNotifications(actor.userId);
  return (
    <CommandShell user={{ name: actor.name, email: actor.email, role: actor.role }} nav={nav} actions={actions} unread={unread}>
      {children}
    </CommandShell>
  );
}
