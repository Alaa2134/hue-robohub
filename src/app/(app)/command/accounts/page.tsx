import type { Metadata } from "next";
import { AccountActions, CreateAccount } from "@/components/command/accounts-ui";
import { PageHeader, Panel, StatusBadge, relTime } from "@/components/command/ui";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { listAccounts, membersWithoutAccount } from "@/server/queries/accounts-admin";

export const metadata: Metadata = { title: "Accounts" };

const ROLE_TONE = { owner: "gold", admin: "violet", lead: "progress", member: "info", trainee: "neutral" } as const;

export default async function AccountsPage() {
  const actor = await requirePage("accounts.view");
  const manage = can(actor.role, "accounts.manage");
  const [users, members] = await Promise.all([listAccounts(), manage ? membersWithoutAccount() : Promise.resolve([])]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Access"
        title="Accounts"
        description="Who can sign in to the Command Center and what they can do. New people get a one-time link to set their own password — no passwords are ever sent or seen by admins."
      />
      {manage && (
        <Panel title="Add an account" className="mb-6">
          <CreateAccount actorRole={actor.role} members={members} />
        </Panel>
      )}
      <ul className="flex flex-col gap-3">
        {users.map((u) => (
          <li key={u.id} className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-deep/40 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-chalk">{u.name}</span>
                <StatusBadge status={u.role} label={ROLE_LABEL[u.role]} tone={ROLE_TONE[u.role]} />
                {u.status !== "active" && <StatusBadge status="disabled" />}
                {u.mfa ? <StatusBadge status="ok" tone="ok" label="2FA on" /> : <StatusBadge status="off" tone="warn" label="No 2FA" />}
                {u.lockedUntil && u.lockedUntil > new Date() && <StatusBadge status="locked" tone="danger" label="Locked" />}
              </p>
              <p className="mt-1 truncate text-sm text-fog" dir="ltr">
                {u.email}
              </p>
              <p className="mt-1 text-xs text-steel">
                {u.member ? `Member: ${u.member} · ` : ""}
                {u.lastLoginAt ? `Last sign-in ${relTime(u.lastLoginAt)}` : "Never signed in"}
              </p>
            </div>
            {manage && <AccountActions user={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, mfa: u.mfa }} actorRole={actor.role} self={u.id === actor.userId} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
