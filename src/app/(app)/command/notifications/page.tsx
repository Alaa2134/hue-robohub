import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Icon, type IconName } from "@/components/brand/icons";
import { EmptyPanel, PageHeader, relTime } from "@/components/command/ui";
import { cn } from "@/lib/cn";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Notifications" };

const ICON: Record<string, IconName> = { application: "rocket", message: "mail", task: "check", event: "calendar" };

/** Inbox of in-app notifications; opening it marks everything read. */
export default async function NotificationsPage() {
  const actor = await requirePage("dashboard.view");
  const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, actor.userId)).orderBy(desc(s.notifications.createdAt)).limit(60);
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, actor.userId), isNull(s.notifications.readAt)));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Inbox" title="Notifications" description="New applications, contact messages and tasks assigned to you." />
      {!rows.length ? (
        <EmptyPanel icon="signal" title="All quiet" body="You'll see new applications, messages and task assignments here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((n) => {
            const body = (
              <>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", n.readAt ? "border-[var(--line)] text-fog" : "border-cyan/40 bg-cyan/10 text-cyan")}>
                  <Icon name={ICON[n.kind] ?? "signal"} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.readAt ? "text-mist" : "font-semibold text-chalk")}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-fog">{n.body}</span>}
                </span>
                <span className="shrink-0 font-mono text-[0.65rem] text-fog">{relTime(n.createdAt)}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.href?.startsWith("/command") ? (
                  <Link href={n.href} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-deep/40 p-3 hover:border-[var(--line-2)]">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-deep/40 p-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
