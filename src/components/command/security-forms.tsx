"use client";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import type { ActionResult } from "@/server/action";
import { updateMyName } from "@/server/actions/accounts";
import { beginMfaAction, changePasswordAction, confirmMfaAction, disableMfaAction } from "@/server/actions/auth";
import { PasswordInput, Strength } from "./auth-forms";
import { Field, FormError, Input } from "./field";

function Saved({ text }: { text: string }) {
  return (
    <span role="status" className="flex items-center gap-2 text-sm text-ok">
      <Icon name="check" size={14} /> {text}
    </span>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateMyName, null as ActionResult | null);
  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field label="Display name" name="name" error={state && !state.ok ? state.fieldErrors?.name : undefined} className="flex-1">
        <Input name="name" defaultValue={name} required minLength={2} maxLength={120} />
      </Field>
      <button type="submit" disabled={pending} className="btn btn-sm h-11">
        <span>{pending ? "Saving…" : "Save"}</span>
      </button>
      {state?.ok && <Saved text="Saved" />}
    </form>
  );
}

export function ChangePasswordForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, null as ActionResult | null);
  const [pw, setPw] = useState("");
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3" key={state?.ok ? "done" : "form"}>
      <Field label="Current password" name="current" error={fe.current}>
        <PasswordInput name="current" autoComplete="current-password" error={fe.current} />
      </Field>
      <Field label="New password" name="next" error={fe.next} hint={<Strength value={pw} context={[name, email]} />}>
        <PasswordInput name="next" autoComplete="new-password" onChange={setPw} error={fe.next} />
      </Field>
      <Field label="Confirm new password" name="confirm" error={fe.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" error={fe.confirm} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          <span aria-hidden className="btn-sheen" />
          <Icon name="lock" size={14} />
          <span>{pending ? "Updating…" : "Change password"}</span>
        </button>
        {state?.ok && <Saved text="Password changed — your other devices were signed out." />}
        <FormError message={state && !state.ok ? state.error : undefined} requestId={state && !state.ok ? state.requestId : undefined} />
      </div>
    </form>
  );
}

/** Authenticator-app two-factor: enrol with a real QR code (otpauth URI), confirm with a 6-digit code, or disable. */
export function MfaPanel({ enabled }: { enabled: boolean }) {
  const [enrol, setEnrol] = useState<{ secret: string; qr: string } | null>(null);
  const [beginError, setBeginError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmMfaAction, null as ActionResult | null);
  const [disableState, disableAction, disabling] = useActionState(disableMfaAction, null as ActionResult | null);

  if (confirmState?.ok) return <Saved text="Two-factor authentication is on. Other devices were signed out." />;
  if (disableState?.ok) return <Saved text="Two-factor authentication is off." />;

  if (enabled)
    return (
      <form action={disableAction} className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm text-ok">
          <Icon name="shield" size={16} /> Two-factor authentication is on. Sign-ins need a code from your authenticator app.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Password to turn it off" name="password" className="flex-1">
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <button type="submit" disabled={disabling} className="btn btn-sm h-11 text-danger">
            <span>{disabling ? "Turning off…" : "Turn off 2FA"}</span>
          </button>
        </div>
        <FormError message={disableState && !disableState.ok ? disableState.error : undefined} />
      </form>
    );

  if (!enrol)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-mist">Protect your account with a 6-digit code from Google Authenticator, Microsoft Authenticator or any TOTP app. Strongly recommended for owners and admins.</p>
        <button
          type="button"
          disabled={starting}
          className="btn btn-primary btn-sm self-start"
          onClick={() =>
            start(async () => {
              const r = await beginMfaAction();
              if (r.ok) setEnrol({ secret: r.data.secret, qr: r.data.qr });
              else setBeginError(r.error);
            })
          }
        >
          <span aria-hidden className="btn-sheen" />
          <Icon name="shield" size={14} />
          <span>{starting ? "Preparing…" : "Set up two-factor"}</span>
        </button>
        {beginError && <p className="text-sm text-danger">{beginError}</p>}
      </div>
    );

  return (
    <form action={confirmAction} className="grid gap-6 sm:grid-cols-[13rem_1fr]">
      <div className="rounded-xl border border-[var(--line-2)] bg-void p-3">
        <div className="aspect-square w-full [&_svg]:size-full" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: enrol.qr }} />
      </div>
      <div className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1 ps-5 text-sm text-mist">
          <li>Open your authenticator app and scan the QR code.</li>
          <li>
            Can&apos;t scan? Enter this key: <code className="break-all rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-chalk">{enrol.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        <Field label="Code" name="code" error={confirmState && !confirmState.ok ? confirmState.fieldErrors?.code : undefined}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="max-w-[12rem] text-center font-mono text-lg tracking-[0.4em]" />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={confirming} className="btn btn-primary btn-sm">
            <span aria-hidden className="btn-sheen" />
            <Icon name="check" size={14} />
            <span>{confirming ? "Checking…" : "Turn on 2FA"}</span>
          </button>
          <FormError message={confirmState && !confirmState.ok ? confirmState.error : undefined} />
        </div>
      </div>
    </form>
  );
}
