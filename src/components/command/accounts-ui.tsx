"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { ROLE_LABEL, canAssignRole, type Role } from "@/lib/permissions";
import type { ActionResult } from "@/server/action";
import { createAccount, issueSignInLink, resetAccountMfa, setAccountRole, setAccountStatus } from "@/server/actions/accounts";
import { Field, FormError, Input, Select } from "./field";
import { ShareLink } from "./share-link";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including other owners and admins",
  admin: "Members, recruitment, website, accounts, settings",
  lead: "Projects, tasks, events, bootcamp, attendance, media",
  member: "Own tasks and projects, calendar, files",
  trainee: "Bootcamp, calendar, own tasks, attendance check-in",
};

export function CreateAccount({ actorRole, members }: { actorRole: Role; members: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createAccount, null as ActionResult<{ link: string; name: string; email: string }> | null);
  const [open, setOpen] = useState(false);
  const roles = (["trainee", "member", "lead", "admin", "owner"] as Role[]).filter((r) => canAssignRole(actorRole, null, r));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (state?.ok)
    return (
      <div className="flex flex-col gap-3">
        <ShareLink link={state.data.link} name={state.data.name} email={state.data.email} note={`Account created for ${state.data.name}. Send them this link to set their password.`} />
        <button type="button" className="btn btn-sm self-start" onClick={() => location.reload()}>
          <span>Done</span>
        </button>
      </div>
    );
  if (!open)
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        <span aria-hidden className="btn-sheen" />
        <Icon name="plus" size={15} />
        <span>Add account</span>
      </button>
    );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" name="name" error={fe.name}>
        <Input name="name" required minLength={2} autoComplete="off" />
      </Field>
      <Field label="Email" name="email" error={fe.email}>
        <Input name="email" type="email" required autoComplete="off" dir="ltr" />
      </Field>
      <Field label="Role" name="role" hint="What they can see and change">
        <Select name="role" defaultValue="member">
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]} — {ROLE_HELP[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Link to member profile" name="memberId" error={fe.memberId} optional>
        <Select name="memberId" defaultValue="">
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          <span aria-hidden className="btn-sheen" />
          <Icon name="check" size={14} />
          <span>{pending ? "Creating…" : "Create & get link"}</span>
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          <span>Cancel</span>
        </button>
        <FormError message={state && !state.ok ? state.error : undefined} requestId={state && !state.ok ? state.requestId : undefined} />
      </div>
    </form>
  );
}

export function AccountActions({ user, actorRole, self }: { user: { id: string; name: string; email: string; role: Role; status: string; mfa: boolean }; actorRole: Role; self: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  if (self) return <span className="text-xs text-fog">You — manage in Settings</span>;
  const editable = actorRole === "owner" || (user.role !== "owner" && user.role !== "admin");
  if (!editable) return <span className="text-xs text-fog">Owner-only</span>;
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: (r: ActionResult<unknown>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        after?.(r);
        router.refresh();
      }
    });
  const roles = (["trainee", "member", "lead", "admin", "owner"] as Role[]).filter((r) => r === user.role || canAssignRole(actorRole, user.role, r));

  return (
    <div className="relative z-10 flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <select aria-label={`Role for ${user.name}`} disabled={pending} value={user.role} onChange={(e) => run(() => setAccountRole(user.id, e.target.value as Role))} className="h-8 rounded-md border border-[var(--line-2)] bg-deep px-2 text-xs text-mist">
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        {user.status === "active" && (
          <button type="button" disabled={pending} className="btn btn-sm" onClick={() => run(() => issueSignInLink(user.id), (r) => r.ok && setLink((r.data as { link: string }).link))}>
            <span>New sign-in link</span>
          </button>
        )}
        {user.mfa && (
          <button type="button" disabled={pending} className="btn btn-sm" onClick={() => confirm(`Remove two-factor for ${user.name}? They will set it up again.`) && run(() => resetAccountMfa(user.id))}>
            <span>Reset 2FA</span>
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          className={user.status === "active" ? "btn btn-sm text-danger" : "btn btn-sm"}
          onClick={() => (user.status === "active" ? confirm(`Disable ${user.name}? They are signed out immediately.`) && run(() => setAccountStatus(user.id, "disabled")) : run(() => setAccountStatus(user.id, "active")))}
        >
          <span>{user.status === "active" ? "Disable" : "Enable"}</span>
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {link && (
        <div className="w-full max-w-xl text-start">
          <ShareLink link={link} name={user.name} email={user.email} note={`New sign-in link for ${user.name}. Their other sessions were signed out.`} />
        </div>
      )}
    </div>
  );
}
