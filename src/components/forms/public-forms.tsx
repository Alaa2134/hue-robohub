"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { Field, FormError, Input, Select, Textarea } from "@/components/command/field";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";
import { submitApplication, submitContact } from "@/server/actions/public";

function useFormToken(form: "join" | "contact") {
  const [token, setToken] = useState("");
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/form-token?form=${form}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { token?: string | null; disabled?: boolean }) => {
        if (!alive) return;
        setToken(d.token ?? "");
        setDisabled(!!d.disabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [form]);
  return { token, disabled };
}

/** Honeypot: invisible to people, irresistible to bots. */
function Honeypot() {
  return (
    <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full sm:w-auto disabled:opacity-70">
      <span aria-hidden className="btn-sheen" />
      <span>{pending ? pendingLabel : label}</span>
      {!pending && <Icon name="arrow" size={16} className="btn-arrow" />}
    </button>
  );
}

function Success({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="frame flex flex-col items-start gap-5 p-8 outline-none sm:p-10" style={{ ["--edge" as string]: 0.8 }}>
      <span className="flex size-14 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
        <Icon name="check" size={26} />
      </span>
      <p className="t-headline text-3xl text-chalk">{title}</p>
      <p className="max-w-lg text-mist">{body}</p>
      {children}
    </div>
  );
}

type JoinLabels = {
  sections: { about: string; tech: string; motivation: string };
  fields: Record<string, string>;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  optional: string;
  next: string;
  back: string;
  of: string;
  privacy: string;
  unavailable: string;
  years: string[];
  noTrack: string;
};

export function JoinForm({ labels, tracks }: { labels: JoinLabels; tracks: { id: string; name: string }[] }) {
  const { token, disabled } = useFormToken("join");
  const [state, action, pending] = useActionState(submitApplication, null as ActionResult<{ id: string }> | null);
  const [step, setStep] = useState(0);
  const sets = useRef<(HTMLFieldSetElement | null)[]>([]);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors ?? {};

  useEffect(() => {
    if (!err?.fieldErrors) return;
    const order = [["fullName", "email", "phone", "academicYear"], ["trackId", "skills", "experience", "portfolioUrl", "githubUrl"], ["motivation", "availability", "consent"]];
    const first = order.findIndex((g) => g.some((k) => err.fieldErrors![k]));
    if (first >= 0) setStep(first);
  }, [err]);

  if (state?.ok) return <Success title={labels.successTitle} body={labels.successBody} />;

  const steps = [labels.sections.about, labels.sections.tech, labels.sections.motivation];
  const next = () => {
    const fs = sets.current[step];
    if (fs && !Array.from(fs.querySelectorAll("input,select,textarea")).every((el) => (el as HTMLInputElement).reportValidity())) return;
    setStep((s) => Math.min(2, s + 1));
    requestAnimationFrame(() => sets.current[step + 1]?.querySelector<HTMLElement>("input,select,textarea")?.focus());
  };

  return (
    <form action={action} className="relative flex flex-col gap-8" noValidate={false}>
      <Honeypot />
      <input type="hidden" name="_t" value={token} />
      <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} className="flex w-full flex-col gap-2 text-start" aria-current={i === step ? "step" : undefined}>
              <span className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-gradient-to-r from-volt to-cyan" : "bg-steel")} />
              <span className={cn("t-eyebrow text-[0.58rem]", i === step ? "text-chalk" : "text-fog")}>
                {String(i + 1).padStart(2, "0")} · {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <fieldset ref={(el) => void (sets.current[0] = el)} hidden={step !== 0} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">{steps[0]}</legend>
        <Field label={labels.fields.fullName} name="fullName" error={fe.fullName} className="sm:col-span-2">
          <Input name="fullName" autoComplete="name" required minLength={3} maxLength={120} error={fe.fullName} />
        </Field>
        <Field label={labels.fields.email} name="email" error={fe.email}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required error={fe.email} />
        </Field>
        <Field label={labels.fields.phone} name="phone" error={fe.phone} hint={labels.privacy}>
          <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" required pattern="[+0-9][0-9 \(\)\-]{6,23}" error={fe.phone} dir="ltr" />
        </Field>
        <Field label={labels.fields.academicYear} name="academicYear" error={fe.academicYear}>
          <Select name="academicYear" required defaultValue="" error={fe.academicYear}>
            <option value="" disabled>
              —
            </option>
            {labels.years.map((y, i) => (
              <option key={y} value={i + 1}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset ref={(el) => void (sets.current[1] = el)} hidden={step !== 1} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">{steps[1]}</legend>
        <Field label={labels.fields.track} name="trackId" error={fe.trackId} className="sm:col-span-2">
          <Select name="trackId" defaultValue="" error={fe.trackId}>
            <option value="">{labels.noTrack}</option>
            {tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.fields.skills} name="skills" error={fe.skills} hint={labels.fields.skillsHint} className="sm:col-span-2" optional>
          <Input name="skills" maxLength={500} error={fe.skills} />
        </Field>
        <Field label={labels.fields.experience} name="experience" error={fe.experience} hint={labels.fields.experienceHint} className="sm:col-span-2" optional>
          <Textarea name="experience" maxLength={3000} rows={4} error={fe.experience} />
        </Field>
        <Field label={labels.fields.portfolio} name="portfolioUrl" error={fe.portfolioUrl} optional>
          <Input name="portfolioUrl" type="url" inputMode="url" placeholder="https://" error={fe.portfolioUrl} dir="ltr" />
        </Field>
        <Field label={labels.fields.github} name="githubUrl" error={fe.githubUrl} optional>
          <Input name="githubUrl" type="url" inputMode="url" placeholder="https://github.com/" error={fe.githubUrl} dir="ltr" />
        </Field>
      </fieldset>

      <fieldset ref={(el) => void (sets.current[2] = el)} hidden={step !== 2} className="grid gap-5">
        <legend className="sr-only">{steps[2]}</legend>
        <Field label={labels.fields.motivation} name="motivation" error={fe.motivation}>
          <Textarea name="motivation" required minLength={30} maxLength={3000} rows={6} error={fe.motivation} />
        </Field>
        <Field label={labels.fields.availability} name="availability" error={fe.availability} hint={labels.fields.availabilityHint}>
          <Input name="availability" required minLength={3} maxLength={500} error={fe.availability} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-mist">
          <input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 accent-[#2b6dff]" />
          <span>{labels.fields.consent}</span>
        </label>
        {fe.consent && <p className="text-xs text-danger">{fe.consent}</p>}
      </fieldset>

      <FormError message={disabled ? labels.unavailable : err?.error} requestId={err?.requestId} />

      <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl bg-void/80 p-1 backdrop-blur lg:static lg:bg-transparent lg:p-0">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="btn">
            <Icon name="arrow" size={15} className="rotate-180 rtl:rotate-0" />
            <span>{labels.back}</span>
          </button>
        ) : (
          <span className="font-mono text-xs text-fog">
            1 {labels.of} 3
          </span>
        )}
        {step < 2 ? (
          <button type="button" onClick={next} className="btn btn-primary">
            <span aria-hidden className="btn-sheen" />
            <span>{labels.next}</span>
            <Icon name="arrow" size={15} className="btn-arrow" />
          </button>
        ) : (
          <SubmitButton pending={pending || !token} label={labels.submit} pendingLabel={labels.submitting} />
        )}
      </div>
    </form>
  );
}

type ContactLabels = { fields: Record<string, string>; topics: Record<string, string>; submit: string; submitting: string; successTitle: string; successBody: string; optional: string; unavailable: string };

export function ContactForm({ labels, defaultTopic }: { labels: ContactLabels; defaultTopic?: string }) {
  const { token, disabled } = useFormToken("contact");
  const [state, action, pending] = useActionState(submitContact, null as ActionResult<{ id: string }> | null);
  const err = state && !state.ok ? state : null;
  const fe = err?.fieldErrors ?? {};
  if (state?.ok) return <Success title={labels.successTitle} body={labels.successBody} />;
  return (
    <form action={action} className="relative grid gap-5 sm:grid-cols-2">
      <Honeypot />
      <input type="hidden" name="_t" value={token} />
      <Field label={labels.fields.name} name="name" error={fe.name}>
        <Input name="name" autoComplete="name" required minLength={2} maxLength={120} error={fe.name} />
      </Field>
      <Field label={labels.fields.email} name="email" error={fe.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required error={fe.email} />
      </Field>
      <Field label={labels.fields.organization} name="organization" error={fe.organization} optional>
        <Input name="organization" autoComplete="organization" maxLength={160} error={fe.organization} />
      </Field>
      <Field label={labels.fields.topic} name="topic" error={fe.topic}>
        <Select name="topic" defaultValue={defaultTopic && labels.topics[defaultTopic] ? defaultTopic : "general"} error={fe.topic}>
          {Object.entries(labels.topics).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={labels.fields.message} name="message" error={fe.message} className="sm:col-span-2">
        <Textarea name="message" required minLength={20} maxLength={5000} rows={6} error={fe.message} />
      </Field>
      <div className="sm:col-span-2">
        <FormError message={disabled ? labels.unavailable : err?.error} requestId={err?.requestId} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending || !token} label={labels.submit} pendingLabel={labels.submitting} />
      </div>
    </form>
  );
}

export function ClosedNotice({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="frame flex flex-col items-start gap-4 p-8">
      <span className="t-eyebrow text-warn">{title}</span>
      <p className="max-w-lg text-mist">{body}</p>
      <Link href={href} className="btn btn-sm">
        <span>{cta}</span>
      </Link>
    </div>
  );
}
