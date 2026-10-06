import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";
import { ChangePasswordForm, MfaPanel, ProfileForm } from "@/components/command/security-forms";
import { PageHeader, Panel, StatusBadge, relTime } from "@/components/command/ui";
import { ROLE_LABEL } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePage("dashboard.view");
  const [u] = await db.select({ name: s.users.name, email: s.users.email, mfa: s.users.totpEnabled, passwordChangedAt: s.users.passwordChangedAt, lastLoginAt: s.users.lastLoginAt }).from(s.users).where(eq(s.users.id, actor.userId)).limit(1);
  const sessions = await db.select({ id: s.sessions.id, createdAt: s.sessions.createdAt, ip: s.sessions.ip, userAgent: s.sessions.userAgent }).from(s.sessions)
    .where(and(eq(s.sessions.userId, actor.userId), eq(s.sessions.pendingMfa, false), gt(s.sessions.absoluteExpiresAt, new Date()), gt(s.sessions.idleExpiresAt, new Date())));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Your account" title="Settings" description={<span className="flex flex-wrap items-center gap-2">Signed in as <span dir="ltr" className="text-chalk">{u?.email}</span> <StatusBadge status={actor.role} label={ROLE_LABEL[actor.role]} tone="info" /></span>} />
      <div className="flex flex-col gap-6">
        <Panel title="Profile">
          <ProfileForm name={u?.name ?? actor.name} />
        </Panel>
        <Panel id="security" title="Two-factor authentication" kicker="Security">
          <MfaPanel enabled={!!u?.mfa} />
        </Panel>
        <Panel title="Password" kicker={u?.passwordChangedAt ? `Last changed ${relTime(u.passwordChangedAt)}` : undefined}>
          <ChangePasswordForm name={u?.name ?? ""} email={u?.email ?? ""} />
        </Panel>
        <Panel title="Signed-in devices" kicker={`${sessions.length} active`}>
          <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
            {sessions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate text-mist">{x.userAgent ? x.userAgent.replace(/\s*\(KHTML.*$/, "").slice(0, 80) : "Unknown device"}</span>
                <span className="font-mono text-xs text-fog">
                  {x.id === actor.sessionId ? "This device · " : ""}since {relTime(x.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fog">Changing your password or turning on two-factor signs out every other device.</p>
        </Panel>
      </div>
    </div>
  );
}
