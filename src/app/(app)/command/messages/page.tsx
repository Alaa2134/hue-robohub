import type { Metadata } from "next";
import { count, desc, eq, ne } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { MarkReadOnOpen, MessageActions } from "@/components/command/message-actions";
import { EmptyPanel, PageHeader, StatusBadge, Tabs, relTime } from "@/components/command/ui";
import { mailtoLink } from "@/lib/contact";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Messages" };

const TABS = [
  ["inbox", "Inbox"],
  ["archived", "Archived"],
] as const;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePage("messages.view");
  const { status: raw } = await searchParams;
  const status = raw === "archived" ? "archived" : "inbox";
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(s.contactMessages)
      .where(status === "archived" ? eq(s.contactMessages.status, "archived") : ne(s.contactMessages.status, "archived"))
      .orderBy(desc(s.contactMessages.createdAt))
      .limit(200),
    db.select({ status: s.contactMessages.status, n: count() }).from(s.contactMessages).groupBy(s.contactMessages.status),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>;
  const n = { inbox: (by.new ?? 0) + (by.read ?? 0), archived: by.archived ?? 0 };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Inbox" title="Messages" description={`Everything sent through the website's contact form — sponsorships, collaborations, media and general questions. ${by.new ?? 0} unread. Reply opens your email app.`} />
      <Tabs current={`/command/messages?status=${status}`} items={TABS.map(([k, l]) => ({ href: `/command/messages?status=${k}`, label: l, count: n[k] }))} />
      {!rows.length ? (
        <EmptyPanel icon="mail" title={status === "inbox" ? "Inbox zero" : "Nothing archived"} body={status === "inbox" ? "New messages from the contact page land here." : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((m) => (
            <li key={m.id}>
              <MarkReadOnOpen id={m.id} unread={m.status === "new"}>
                <summary className="flex cursor-pointer list-none items-start gap-4 p-4 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-steel/60 group-data-[unread=true]:bg-cyan group-data-[unread=true]:shadow-[0_0_8px_var(--color-cyan)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-mist group-data-[unread=true]:font-semibold group-data-[unread=true]:text-chalk">{m.name}</span>
                      {m.status === "new" && <span className="sr-only">(unread)</span>}
                      {m.organization && <span className="text-xs text-fog">· {m.organization}</span>}
                      <StatusBadge status={m.topic} tone="info" />
                    </span>
                    <span className="mt-1 block truncate text-sm text-fog group-open:hidden">{m.message}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-fog">{relTime(m.createdAt)}</span>
                </summary>
                <div className="flex flex-col gap-4 border-t border-[var(--line)] px-4 py-4 sm:ps-10">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-mist" dir="auto">
                    {m.message}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={mailtoLink(m.email, `Re: ${m.topic} — BuildX HUE`, `\n\n—\nOn ${m.createdAt.toISOString().slice(0, 10)}, ${m.name} wrote:\n${m.message.slice(0, 1200)}`)} className="btn btn-primary btn-sm">
                      <span aria-hidden className="btn-sheen" />
                      <Icon name="mail" size={14} />
                      <span>Reply</span>
                    </a>
                    <span className="text-xs text-fog" dir="ltr">
                      {m.email}
                    </span>
                    <div className="ms-auto">
                      <MessageActions id={m.id} status={m.status} />
                    </div>
                  </div>
                </div>
              </MarkReadOnOpen>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
