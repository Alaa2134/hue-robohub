"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { checkPassword } from "@/lib/password-policy";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";
import { forgotPasswordAction, loginAction, mfaAction, resetPasswordAction, setupAction } from "@/server/actions/auth";
import { Field, FormError, Input } from "./field";

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full disabled:opacity-70">
      <span aria-hidden className="btn-sheen" />
      <span>{pending ? "Working…" : children}</span>
      {!pending && <Icon name="arrow" size={16} className="btn-arrow" />}
    </button>
  );
}

function errs<T>(s: ActionResult<T> | null) {
  return s && !s.ok ? s : null;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [mfaState, mfaFormAction, mfaPending] = useActionState(mfaAction, null);
  const needMfa = state?.ok && state.data.mfa;
  const e = errs(state);
  if (needMfa) {
    const me = errs(mfaState);
    return (
      <form action={mfaFormAction} className="flex flex-col gap-5">
        <p className="text-sm text-mist">Enter the 6-digit code from your authenticator app.</p>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Authentication code" name="code" error={me?.fieldErrors?.code ?? undefined}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="text-center font-mono text-xl tracking-[0.5em]" />
        </Field>
        <FormError message={me?.error} requestId={me?.requestId} />
        <Submit pending={mfaPending}>Verify</Submit>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      {notice && <p className="rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-2.5 text-sm text-[#a6f0cf]">{notice}</p>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" error={e?.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <Field label="Password" name="password" error={e?.fieldErrors?.password}>
        <PasswordInput name="password" autoComplete="current-password" />
      </Field>
      <FormError message={e?.error} requestId={e?.requestId} />
      <Submit pending={pending}>Sign in</Submit>
      <Link href="/forgot-password" className="self-center text-sm text-fog transition-colors hover:text-chalk">
        Forgot your password?
      </Link>
    </form>
  );
}

export function PasswordInput({ name, autoComplete, onChange, error }: { name: string; autoComplete: string; onChange?: (v: string) => void; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required error={error} onChange={(e) => onChange?.(e.target.value)} className="pe-12" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-fog hover:text-chalk" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        <Icon name="eye" size={18} />
      </button>
    </div>
  );
}

export function Strength({ value, context }: { value: string; context: string[] }) {
  const c = useMemo(() => checkPassword(value, context), [value, context]);
  if (!value) return <p className="text-xs text-fog">12+ characters with a mix of cases, numbers and symbols — or a 20+ character passphrase.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < c.score ? (c.score >= 3 ? "bg-ok" : c.score === 2 ? "bg-warn" : "bg-danger") : "bg-steel")} />
        ))}
      </div>
      <p className={cn("text-xs", c.ok ? "text-ok" : "text-warn")} aria-live="polite">
        {c.ok ? "Strong password" : c.issues.join(" · ")}
      </p>
    </div>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  const [pw, setPw] = useState("");
  const [ctx, setCtx] = useState({ name: "", email: "" });
  const e = errs(state);
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Your name" name="name" error={e?.fieldErrors?.name}>
        <Input name="name" autoComplete="name" required autoFocus onChange={(ev) => setCtx((c) => ({ ...c, name: ev.target.value }))} />
      </Field>
      <Field label="Email" name="email" error={e?.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="username" inputMode="email" required onChange={(ev) => setCtx((c) => ({ ...c, email: ev.target.value }))} />
      </Field>
      <Field label="Password" name="password" error={e?.fieldErrors?.password} hint={<Strength value={pw} context={[ctx.name, ctx.email]} />}>
        <PasswordInput name="password" autoComplete="new-password" onChange={setPw} />
      </Field>
      <Field label="Confirm password" name="confirm" error={e?.fieldErrors?.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" />
      </Field>
      <FormError message={e?.error} requestId={e?.requestId} />
      <Submit pending={pending}>Create owner account</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return <p className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-[#a6f0cf]">If an active account exists for that email, a reset link is on its way. It expires in 30 minutes.</p>;
  }
  const e = errs(state);
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Account email" name="email">
        <Input name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <FormError message={e?.error} requestId={e?.requestId} />
      <Submit pending={pending}>Send reset link</Submit>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  const [pw, setPw] = useState("");
  const e = errs(state);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" error={e?.fieldErrors?.password} hint={<Strength value={pw} context={[]} />}>
        <PasswordInput name="password" autoComplete="new-password" onChange={setPw} />
      </Field>
      <Field label="Confirm new password" name="confirm" error={e?.fieldErrors?.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" />
      </Field>
      <FormError message={e?.error} requestId={e?.requestId} />
      <Submit pending={pending}>Set new password</Submit>
    </form>
  );
}
